"""Targeted concurrency probe for the 3-approval logic in AnswerService.

The suspect: reviewAnswer() increments approvalCount ($inc) and then runs a
separate >= 3 check, with no per-reviewer idempotency guard. This probe
fires concurrent 'accepted' reviews and checks the resulting invariants:

  I1  approvalCount on the answer == number of accepted review docs
  I2  no reviewer has more than one accepted review for the same answer
  I3  answer promoted (pending-with-moderator) iff approvalCount >= 3

Modes:
  duplicate  the assigned reviewer fires N identical accepted reviews at once
             (per-reviewer idempotency under concurrency)
  multi      N reviewers were assigned in sequence and all fire at once.
             By design only the LAST assignee is authorized, so this probes
             stale-assignment rejection under concurrency — it is NOT a race
             between multiple simultaneously authorized reviewers (the
             assignment model does not allow that state).
  deadlock   reproduce the first-answer transaction self-deadlock: seed a
             question whose currentExpertOpenedAt is null (never "opened"),
             submit the first answer, and time it. The buggy path calls
             markQuestionOpenedByExpert() without the transaction session and
             blocks on the transaction's own uncommitted write (~60s hang).
  reputation drive a 3-approval cycle where each reviewer's accepted review
             is fired as N concurrent duplicates (stopping once 3 approvals
             have committed), then verify reputation LEDGER consistency:

               I4  each participant's reputation delta == number of their
                   committed documents (1 for the answer submission, 1 per
                   committed accepted-review document). Scores are pinned to
                   a known positive value first because the backend floors
                   at 0. NOTE: this mutates reputation_score directly in
                   Mongo — do not run against a shared environment.

             Scope: I4 checks that the reputation counter never diverges
             from the committed review documents (no lost or phantom
             decrements under concurrency) — it does NOT claim the committed
             reviews themselves are valid; a duplicate review that wrongly
             commits (Finding 2) correctly costs an extra decrement and is
             flagged by I2, not I4. With --shots 1 this is the clean
             sequential case; with --shots > 1 it exercises simultaneous
             review landings.

  moderator  drive an answer to promotion, then fire N concurrent final
             approvals for the SAME answer across moderators. Checks the
             moderator gate under simultaneous processing:

               M1  question ends exactly 'closed'
               M2  answer ends approved + isFinalAnswer
               M3  author incentive incremented exactly once (no double
                   payout when two moderators approve simultaneously)

  allocation fire N concurrent manual expert allocations against one
             question, cycling three scenarios per round: distinct experts
             (empty queue), same expert (dedupe guard), and near-cap (queue
             pre-seeded with 9, concurrent adds race the 10-cap). Checks:

               A0  at least one allocation commits per round
               A1  queue never exceeds the 10-expert cap
               A2  no duplicate experts in the queue
               A3  exactly one +1 first-allocation workload grant with an
                   empty starting queue (zero grants when pre-seeded)
               SLA each allocation call completes within 30s

             NOTE: moderator/allocation modes mutate reputation_score and
             upsert LGD reference docs (states/districts) as setup — run
             only against a disposable test database.

Usage:
    python race_probe.py --mode duplicate --shots 5 --rounds 10
    python race_probe.py --mode multi --shots 4 --rounds 10
    python race_probe.py --mode deadlock --rounds 1
    python race_probe.py --mode reputation --shots 4 --rounds 5
    python race_probe.py --mode moderator --shots 4 --rounds 5
    python race_probe.py --mode allocation --shots 6 --rounds 6
"""
import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from bson import ObjectId

from common import auth, config, db

PARAMS = {
    "contextRelevance": True,
    "technicalAccuracy": True,
    "practicalUtility": True,
    "valueInsight": True,
    "credibilityTrust": True,
    "readabilityCommunication": True,
}


def load_role(role, n):
    users = json.loads(config.USERS_MANIFEST.read_text())
    picked = [u for u in users if u["role"] == role][:n]
    if len(picked) < n:
        raise SystemExit(f"Need {n} seeded {role}s; run seed_users.py first.")
    for u in picked:
        u["token"] = auth.sign_in(u["email"])["idToken"]
    return picked


def load_experts(n):
    return load_role("expert", n)


def post_review(token, payload, timeout=60):
    try:
        r = requests.post(config.api("/answers/review"), json=payload, headers=auth.bearer(token), timeout=timeout)
        return r.status_code, r.text[:200]
    except requests.exceptions.RequestException as e:
        return "request-error", type(e).__name__


def run_round(mode, shots, experts):
    answerer, *reviewers = experts
    seeded = db.seed_question(
        "Race probe question",
        asker_id=ObjectId(answerer["mongoId"]),
        queue=[ObjectId(u["mongoId"]) for u in experts],
    )
    qid = str(seeded["questionId"])

    status, body = post_review(
        answerer["token"],
        {"questionId": qid, "answer": "Probe answer.", "sources": [{"source": "probe"}]},
    )
    if status >= 400:
        return {"error": f"answer submission failed: {status} {body}"}

    state = db.get_state(seeded["questionId"])
    answer_id = str(state["answers"][0]["_id"])

    accept = {
        "questionId": qid,
        "status": "accepted",
        "approvedAnswer": answer_id,
        "parameters": PARAMS,
        "remarks": "race probe",
    }

    if mode == "duplicate":
        r0 = reviewers[0]
        db.assign_reviewer(seeded["questionId"], ObjectId(r0["mongoId"]))
        jobs = [(r0["token"], accept)] * shots
    else:  # multi
        for r in reviewers[:shots]:
            db.assign_reviewer(seeded["questionId"], ObjectId(r["mongoId"]))
        jobs = [(r["token"], accept) for r in reviewers[:shots]]

    with ThreadPoolExecutor(max_workers=shots) as ex:
        results = list(ex.map(lambda j: post_review(*j), jobs))

    state = db.get_state(seeded["questionId"])
    answer = state["answers"][0]
    accepted_reviews = [r for r in state["reviews"] if r.get("action") == "accepted" or r.get("status") == "accepted"]
    by_reviewer = {}
    for r in accepted_reviews:
        k = str(r.get("userId") or r.get("reviewerId"))
        by_reviewer[k] = by_reviewer.get(k, 0) + 1

    approval_count = answer.get("approvalCount", 0)
    ok_200 = sum(1 for s, _ in results if s < 400)
    violations = []
    if approval_count != len(accepted_reviews):
        violations.append(f"I1: approvalCount={approval_count} != acceptedReviews={len(accepted_reviews)}")
    dupes = {k: v for k, v in by_reviewer.items() if v > 1}
    if dupes:
        violations.append(f"I2: duplicate accepted reviews by reviewer: {dupes}")
    promoted = answer.get("status") == "pending-with-moderator"
    if (approval_count >= 3) != promoted:
        violations.append(f"I3: approvalCount={approval_count} but status={answer.get('status')}")

    return {
        "http_ok": ok_200,
        "http_total": len(results),
        "statuses": [s for s, _ in results],
        "approvalCount": approval_count,
        "acceptedReviews": len(accepted_reviews),
        "answerStatus": answer.get("status"),
        "violations": violations,
    }


REP_BASELINE = 100


def run_reputation_round(shots, experts):
    """Full 3-approval cycle; each reviewer's accepted review is fired as
    `shots` concurrent duplicates. Verifies I1-I3 plus reputation integrity."""
    answerer, *reviewers = experts[:4]
    participants = [answerer] + reviewers
    ids = [ObjectId(u["mongoId"]) for u in participants]
    db.set_reputation(ids, REP_BASELINE)

    seeded = db.seed_question(
        "Reputation probe question",
        asker_id=ObjectId(answerer["mongoId"]),
        queue=ids,
    )
    qid = str(seeded["questionId"])

    status, body = post_review(
        answerer["token"],
        {"questionId": qid, "answer": "Probe answer.", "sources": [{"source": "probe"}]},
    )
    if status >= 400:
        return {"error": f"answer submission failed: {status} {body}"}

    state = db.get_state(seeded["questionId"])
    answer_id = str(state["answers"][0]["_id"])
    accept = {
        "questionId": qid,
        "status": "accepted",
        "approvedAnswer": answer_id,
        "parameters": PARAMS,
        "remarks": "reputation probe",
    }

    statuses = []
    skipped_reviewers = 0
    for r in reviewers:
        # Stop once 3 approvals are committed: further reviews would land
        # after promotion and are outside the scenario under test.
        current = db.get_state(seeded["questionId"])["answers"][0].get("approvalCount", 0)
        if current >= 3:
            skipped_reviewers += 1
            continue
        db.assign_reviewer(seeded["questionId"], ObjectId(r["mongoId"]))
        jobs = [(r["token"], accept)] * shots
        with ThreadPoolExecutor(max_workers=shots) as ex:
            statuses += [s for s, _ in ex.map(lambda j: post_review(*j), jobs)]

    state = db.get_state(seeded["questionId"])
    answer = state["answers"][0]
    accepted_reviews = [r for r in state["reviews"] if r.get("action") == "accepted" or r.get("status") == "accepted"]
    by_reviewer = {}
    for r in accepted_reviews:
        k = str(r.get("userId") or r.get("reviewerId"))
        by_reviewer[k] = by_reviewer.get(k, 0) + 1

    reputations = db.get_reputations(ids)
    violations = []

    # I4 (scope: reputation LEDGER consistency, not review validity) —
    # each participant's reputation delta must equal the number of review/
    # answer documents that actually committed for them. A duplicate review
    # that wrongly commits (Finding 2) is *expected* to cost an extra
    # decrement here; I2 separately flags the duplicate itself.
    committed = {u["mongoId"]: by_reviewer.get(u["mongoId"], 0) for u in reviewers}
    committed[answerer["mongoId"]] = 1  # the answer submission
    rep_deltas = {}
    for u in participants:
        delta = REP_BASELINE - reputations.get(u["mongoId"], REP_BASELINE)
        rep_deltas[u["email"]] = delta
        expected = committed[u["mongoId"]]
        if delta != expected:
            violations.append(
                f"I4: {u['email']} reputation delta={delta} but committed ops={expected}"
            )

    approval_count = answer.get("approvalCount", 0)
    if approval_count != len(accepted_reviews):
        violations.append(f"I1: approvalCount={approval_count} != acceptedReviews={len(accepted_reviews)}")
    dupes = {k: v for k, v in by_reviewer.items() if v > 1}
    if dupes:
        violations.append(f"I2: duplicate accepted reviews by reviewer: {dupes}")
    promoted = answer.get("status") == "pending-with-moderator"
    if (approval_count >= 3) != promoted:
        violations.append(f"I3: approvalCount={approval_count} but status={answer.get('status')}")

    return {
        "statuses": statuses,
        "approvalCount": approval_count,
        "acceptedReviews": len(accepted_reviews),
        "answerStatus": answer.get("status"),
        "reputationDeltas": rep_deltas,
        "skippedReviewers": skipped_reviewers,
        "violations": violations,
    }


def drive_to_promotion(answerer, reviewers, question_text):
    """Seed a question and drive it to promotion (answer pending-with-moderator,
    question in-review) via the API: first submission + 3 sequential accepted
    reviews. Returns (seeded, answer_id) or (None, error-string)."""
    seeded = db.seed_question(
        question_text,
        asker_id=ObjectId(answerer["mongoId"]),
        queue=[ObjectId(u["mongoId"]) for u in [answerer] + reviewers],
    )
    qid = str(seeded["questionId"])
    status, body = post_review(
        answerer["token"],
        {"questionId": qid, "answer": "Probe answer.", "sources": [{"source": "probe"}]},
    )
    if not isinstance(status, int) or status >= 400:
        return None, f"answer submission failed: {status} {body}"
    answers = db.get_state(seeded["questionId"])["answers"]
    if not answers:
        return None, "answer submission returned OK but no answer document found"
    answer_id = str(answers[0]["_id"])
    accept = {
        "questionId": qid,
        "status": "accepted",
        "approvedAnswer": answer_id,
        "parameters": PARAMS,
        "remarks": "moderator probe setup",
    }
    for r in reviewers[:3]:
        db.assign_reviewer(seeded["questionId"], ObjectId(r["mongoId"]))
        status, body = post_review(r["token"], accept)
        if not isinstance(status, int) or status >= 400:
            return None, f"setup review failed: {status} {body}"
    answers = db.get_state(seeded["questionId"])["answers"]
    if not answers or answers[0].get("status") != "pending-with-moderator":
        got = answers[0].get("status") if answers else "no answer doc"
        return None, f"setup did not reach promotion (answer status={got})"
    return seeded, answer_id


def put_approve(token, payload, timeout=60):
    try:
        t0 = time.monotonic()
        r = requests.put(config.api("/answers/"), json=payload, headers=auth.bearer(token), timeout=timeout)
        return r.status_code, r.text[:200], time.monotonic() - t0
    except requests.exceptions.RequestException as e:
        return "request-error", type(e).__name__, 0.0


def run_moderator_round(shots, experts, moderators):
    """MODERATOR GATE under concurrency: drive an answer to promotion, then
    fire `shots` concurrent final approvals (round-robin across moderators)
    for the SAME answer. Invariants:

      M1  question ends exactly 'closed'
      M2  answer ends approved + isFinalAnswer, approvedBy set
      M3  the author's incentive is incremented exactly once
          (no double payout when two moderators approve simultaneously)
      M4  exactly one of the concurrent approvals succeeds (a second 200
          could only come from the closed-question edit path committing
          during the race window — flagged for investigation)
    """
    answerer, *reviewers = experts[:4]
    author_id = ObjectId(answerer["mongoId"])
    db.ensure_lgd_reference()
    incentive_before = db.get_incentives([author_id]).get(answerer["mongoId"], 0)

    seeded, answer_id = drive_to_promotion(answerer, reviewers, "Moderator gate probe question")
    if seeded is None:
        return {"error": answer_id}
    db.set_normalised_crop(seeded["questionId"])

    payload = {
        "answerId": answer_id,
        "questionId": str(seeded["questionId"]),
        "answer": "Final approved answer.",
        "sources": [{"source": "probe"}],
    }
    jobs = [(moderators[i % len(moderators)]["token"], payload) for i in range(shots)]
    with ThreadPoolExecutor(max_workers=shots) as ex:
        results = list(ex.map(lambda j: put_approve(*j), jobs))

    state = db.get_state(seeded["questionId"])
    question = state["question"]
    if not state["answers"]:
        return {"error": "answer document disappeared after approval race"}
    answer = state["answers"][0]
    incentive_after = db.get_incentives([author_id]).get(answerer["mongoId"], 0)
    incentive_delta = incentive_after - incentive_before
    http_ok = sum(1 for s, _, _ in results if isinstance(s, int) and s < 400)

    violations = []
    if question.get("status") != "closed":
        violations.append(f"M1: question status={question.get('status')} != closed")
    if (
        answer.get("status") != "approved"
        or not answer.get("isFinalAnswer")
        or not answer.get("approvedBy")
    ):
        violations.append(
            f"M2: answer status={answer.get('status')} isFinalAnswer={answer.get('isFinalAnswer')} "
            f"approvedBy={answer.get('approvedBy')}"
        )
    if incentive_delta != 1:
        violations.append(f"M3: author incentive delta={incentive_delta} != 1 (double payout?)")
    if http_ok != 1:
        violations.append(
            f"M4: {http_ok} concurrent approvals returned success (expected exactly 1; "
            "a second 200 during the race window needs investigation — possible "
            "closed-question edit path)"
        )

    return {
        "statuses": [s for s, _, _ in results],
        "http_ok": http_ok,
        "latencies_s": [round(t, 2) for _, _, t in results],
        "questionStatus": question.get("status"),
        "answerStatus": answer.get("status"),
        "incentiveDelta": incentive_delta,
        "violations": violations,
    }


def post_allocate(token, question_id, expert_ids, timeout=60):
    try:
        t0 = time.monotonic()
        r = requests.post(
            config.api(f"/questions/{question_id}/allocate-experts"),
            json={"experts": [str(e) for e in expert_ids]},
            headers=auth.bearer(token),
            timeout=timeout,
        )
        return r.status_code, r.text[:200], time.monotonic() - t0
    except requests.exceptions.RequestException as e:
        return "request-error", type(e).__name__, 0.0


ALLOCATION_SLA_S = 30


def run_allocation_round(shots, experts, moderators, scenario="distinct"):
    """EXPERT ALLOCATION under concurrency: fire `shots` concurrent manual
    allocations (moderator role) against one question. Scenarios:

      distinct  empty queue; each request allocates a DIFFERENT expert
      duplicate empty queue; all requests allocate the SAME expert
                (dedupe guard under concurrency)
      near-cap  queue pre-seeded with 9 experts; concurrent requests add
                DIFFERENT new experts (10-cap guard under concurrency)

    Invariants:

      A0  at least one allocation must commit (all-failed rounds are flagged,
          not silently passed)
      A1  final queue length <= 10 (TOTAL_EXPERTS_LIMIT)
      A2  no duplicate expert ids in the queue
      A3  workload grants: with an initially EMPTY queue, exactly one expert
          gets a grant and that grant is exactly +1 (more grants — or a +2 on
          one expert — means concurrent snapshots each thought they were
          first). With a pre-seeded queue (near-cap) the expected grant
          count is zero.
      SLA every allocation request completes within {ALLOCATION_SLA_S}s
    """
    mod = moderators[0]
    presize = 9 if scenario == "near-cap" else 0
    pool = experts[presize:presize + shots]
    if len(pool) < shots:
        return {"error": f"need {presize + shots} seeded experts for scenario={scenario}"}
    ids = [ObjectId(u["mongoId"]) for u in pool]
    pre_queue = [ObjectId(u["mongoId"]) for u in experts[:presize]]
    db.set_reputation(ids, REP_BASELINE)
    seeded = db.seed_question(
        "Allocation probe question",
        asker_id=ObjectId(experts[-1]["mongoId"]),
        queue=pre_queue,
    )
    qid = str(seeded["questionId"])

    if scenario == "duplicate":
        jobs = [(mod["token"], qid, [ids[0]])] * shots
    else:
        jobs = [(mod["token"], qid, [eid]) for eid in ids]
    with ThreadPoolExecutor(max_workers=shots) as ex:
        results = list(ex.map(lambda j: post_allocate(*j), jobs))

    sub = db.get_state(seeded["questionId"])["submission"]
    if sub is None:
        return {"error": "submission document missing after allocation race"}
    queue = [str(e) for e in (sub.get("queue") or [])]
    reputations = db.get_reputations(ids)
    grants = {
        u["email"]: reputations.get(u["mongoId"], REP_BASELINE) - REP_BASELINE
        for u in pool
    }
    nonzero = {k: v for k, v in grants.items() if v != 0}

    violations = []
    committed = len(queue) - presize
    if committed < 1:
        violations.append(
            f"A0: no allocation committed (statuses={[s for s, _, _ in results]})"
        )
    if len(queue) > 10:
        violations.append(f"A1: queue length {len(queue)} > 10")
    if len(set(queue)) != len(queue):
        violations.append(f"A2: duplicate experts in queue: {queue}")
    if presize == 0:
        # Empty initial queue: exactly one grant, of exactly +1.
        if committed >= 1 and (len(nonzero) != 1 or list(nonzero.values())[0] != 1):
            violations.append(
                f"A3: expected exactly one +1 first-allocation grant, got {nonzero or '{}'}"
            )
    elif nonzero:
        violations.append(f"A3: unexpected workload grants with pre-seeded queue: {nonzero}")
    slow = [round(t, 2) for _, _, t in results if t > ALLOCATION_SLA_S]
    if slow:
        violations.append(f"SLA: allocation calls exceeded {ALLOCATION_SLA_S}s: {slow}")

    return {
        "mode": scenario,
        "statuses": [s for s, _, _ in results],
        "http_ok": sum(1 for s, _, _ in results if isinstance(s, int) and s < 400),
        "latencies_s": [round(t, 2) for _, _, t in results],
        "queueLen": len(queue),
        "queueUnique": len(set(queue)),
        "workloadGrants": nonzero,
        "violations": violations,
    }


def run_deadlock_round(experts, client_timeout=90):
    """Submit a first answer to a never-opened AJRASAKHA question and time it.
    Healthy: replies in well under a second. Buggy: hangs ~60s (transaction
    lifetime) and then fails."""
    answerer = experts[0]
    seeded = db.seed_question(
        "Deadlock probe question",
        asker_id=ObjectId(answerer["mongoId"]),
        queue=[ObjectId(u["mongoId"]) for u in experts[:2]],
        opened=False,  # currentExpertOpenedAt = null -> triggers the buggy path
    )
    t0 = time.monotonic()
    try:
        status, body = post_review(
            answerer["token"],
            {
                "questionId": str(seeded["questionId"]),
                "answer": "Deadlock probe answer.",
                "sources": [{"source": "probe"}],
            },
        )
    except requests.exceptions.ReadTimeout:
        status, body = "client-timeout", ""
    elapsed = time.monotonic() - t0
    verdict = "DEADLOCK REPRODUCED" if elapsed > 30 else "no deadlock"
    return {"status": status, "elapsed_s": round(elapsed, 1), "verdict": verdict}


def main():
    p = argparse.ArgumentParser()
    p.add_argument(
        "--mode",
        choices=["duplicate", "multi", "deadlock", "reputation", "moderator", "allocation"],
        default="duplicate",
    )
    p.add_argument("--shots", type=int, default=5, help="concurrent review requests per round")
    p.add_argument("--rounds", type=int, default=10)
    args = p.parse_args()
    if args.shots < 1 or args.rounds < 1:
        p.error("--shots and --rounds must be >= 1")

    n_experts = max(args.shots + 1, 5)
    if args.mode == "allocation":
        n_experts = max(n_experts, args.shots + 10)  # near-cap pre-seeds 9 + needs `shots` more
    experts = load_experts(n_experts)
    moderators = load_role("moderator", 2) if args.mode in ("moderator", "allocation") else []
    total_violations = []
    for i in range(args.rounds):
        if args.mode == "reputation":
            res = run_reputation_round(args.shots, experts)
        elif args.mode == "moderator":
            res = run_moderator_round(args.shots, experts, moderators)
        elif args.mode == "allocation":
            scenario = ("distinct", "duplicate", "near-cap")[i % 3]
            res = run_allocation_round(args.shots, experts, moderators, scenario=scenario)
        elif args.mode == "deadlock":
            res = run_deadlock_round(experts)
            if res["verdict"] == "DEADLOCK REPRODUCED":
                res["violations"] = [
                    f"first answer submission took {res['elapsed_s']}s "
                    "(markQuestionOpenedByExpert self-deadlock)"
                ]
        else:
            res = run_round(args.mode, args.shots, experts)
        print(f"round {i + 1}: {res}")
        total_violations += res.get("violations", [])

    print("\n=== SUMMARY ===")
    print(f"mode={args.mode} shots={args.shots} rounds={args.rounds}")
    if total_violations:
        print(f"INVARIANT VIOLATIONS ({len(total_violations)}):")
        for v in total_violations:
            print(f"  - {v}")
    else:
        print("No invariant violations detected.")


if __name__ == "__main__":
    main()
