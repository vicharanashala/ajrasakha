# Reviewer System Load & SLA Test Report

**Project 7 — Reviewer System Load and SLA Testing**
Environment: local full stack (real backend, MongoDB 1-node replica set with TLS, Firebase Auth emulator), single machine.
Tooling: Locust (see `README.md`). Each cell below is a 90-second headless run; latencies in ms.

Absolute numbers reflect this machine, not production hardware — what transfers
is the *relative* degradation curve and the correctness findings.

## 1. SLA results by scenario

### 1.1 Expert logins (sign-in + first queue fetch)

| Load | Users | Requests | Failures | Queue fetch med / p95 / p99 | Sign-in med / p95 |
|---|---|---|---|---|---|
| 1x | 50 | 4,340 | 0 | 16 / 29 / 69 | 2 / 4 |
| 5x | 250 | 20,970 | 0 | 25 / 79 / 160 | 2 / 10 |
| 10x | 500 | 32,942 | 0 | **600 / 1,100 / 1,300** | 6 / 51 |

**Verdict:** no failures even at 500 concurrent experts, but queue-fetch latency
degrades ~24x between 5x and 10x (median 25 → 600 ms). Auth itself is never the
bottleneck; the `GET /answers/submissions` aggregation is.

### 1.2 Question ingestion (`POST /questions/`)

| Load | Users | Requests | Failures | med / p95 / p99 |
|---|---|---|---|---|
| 1x | 10 | 441 | 0 | 16 / 21 / 46 |
| 5x | 50 | 2,205 | 0 | 14 / 26 / 56 |
| 10x | 100 | 4,363 | 0 | 15 / 34 / 120 |

**Verdict:** question ingestion scales cleanly — flat latency to ~49 req/s.
Not a bottleneck.

### 1.3 Full reviewer cycle (answer submission + 3 accepted reviews + promotion check)

Per-request failure rates (the `verify` row counts whole cycles that did not
reach a clean 3-approval promotion — it is a derived check, not extra HTTP
traffic):

| Load | Users | Accept fails | Submit fails | Accept med / p95 | Submit med / p95 | Cycles promoted |
|---|---|---|---|---|---|---|
| 1x | 10 | 0 / 1,589 | 0 / 530 | 32 / 57 | 34 / 53 | 529 / 529 (100%) |
| 5x | 50 | 93 / 4,810 (1.9%) | 22 / 1,638 (1.3%) | 160 / 810 | 180 / 780 | 1,500 / 1,593 (94%) |
| 10x | 100 | 438 / 2,662 (16.5%) | 519 / 1,435 (36.2%) | 860 / 3,500 | 1,800 / 3,000 | 448 / 868 (52%) |

**Verdict: this is where the pipeline breaks.** At 5x, review HTTP errors
appear (~2%) and 6% of cycles fail to promote. At 10x, over a third of answer
submissions fail, p95 exceeds 3s, and barely half of the review cycles reach
promotion. The dominant error body is
`InternalServerError: Failed to increment approved count … MongoServerError:
Write conflict during plan execution` — see Finding 3 for why these conflicts
are not retried even though a retry wrapper exists.

## 2. Correctness findings

### Finding 1 (HIGH, reproduced) — transaction self-deadlock on first answer submission

Reproduce: `python race_probe.py --mode deadlock --rounds 2`
Observed: **every** first answer to a never-opened (`currentExpertOpenedAt:
null`) AJRASAKHA question hangs for exactly ~60.0s (MongoDB's
`transactionLifetimeLimitSeconds`) and then fails (2/2 rounds).

Cause: in `AnswerService.reviewAnswer`'s first-submission path, the code calls
`questionSubmissionRepo.markQuestionOpenedByExpert()` **without the transaction
session** while the surrounding transaction has already written to the same
`question_submissions` document. The non-transactional write blocks on the
transaction's own uncommitted write; the transaction cannot commit because it
is awaiting that call — a self-deadlock that holds a request slot and a Mongo
connection for 60s each time. Fix: pass `session` through
`markQuestionOpenedByExpert`.

(The load scenarios deliberately seed questions with `currentExpertOpenedAt`
set so they can measure the rest of the pipeline past this bug.)

### Finding 2 (HIGH, reproduced) — approval double-count race (per-reviewer idempotency)

Reproduce: `python race_probe.py --mode duplicate --shots 8 --rounds 5`
Observed: in 1 of 5 rounds, two identical concurrent 'accepted' reviews from
the **same** assigned reviewer both committed — 2 accepted review documents
from one reviewer and `approvalCount` incremented twice.

Impact: a double-clicking reviewer (or client retry) can contribute 2 of the
3 approvals needed to promote an answer to the moderator queue.
Cause: `reviewAnswer` validates against submission history, then `$inc`s
`approvalCount` — nothing enforces *one accepted review per reviewer per
answer* at the database level, and under concurrency both requests pass
validation before either commits. Fix: a unique index on
`reviews(questionId, answerId, userId)` filtered to accepted reviews, or a
guarded conditional update.

### Finding 3 (MEDIUM) — error wrapping defeats the write-conflict retry; reviews fail with opaque 500s

`BaseService._withTransaction` **does** retry transient errors (3 attempts,
jittered backoff, checks `TransientTransactionError` / code 112). But the
approval-increment path catches the raw `MongoServerError` in the repository
and re-throws it wrapped in an `InternalServerError` (observed response body:
`Failed to increment approved count … Write conflict during plan execution`).
The wrapper has no error labels and no code 112, so the retry check never
recognizes it as transient — every write conflict on `incrementApprovalCount`
becomes an immediate client-facing 500 and a lost review. This accounts for
the failure rates in §1.3. Fix: rethrow preserving the original error (or
inspect `error.cause`) so `_withTransaction`'s existing retry can do its job;
return 409/422 rather than 500 when retries are exhausted.

### Finding 4 (verified OK, scoped) — reputation ledger stays consistent with committed reviews under concurrency

Reproduce: `python race_probe.py --mode reputation --shots 4 --rounds 6`
The probe pins `reputation_score` to a known positive value (the backend
floors at 0), drives a 3-approval cycle firing each accepted review as 4
concurrent duplicates (stopping once 3 approvals commit), and checks I4:
every participant's reputation delta equals the number of documents that
actually *committed* for them (1 for the answer submission, 1 per committed
accepted-review document).

Observed: across all rounds, deltas matched committed documents exactly —
including a round where the Finding 2 duplicate-review race fired (the
reviewer's 2 committed duplicate reviews cost exactly 2 decrements, no more,
no fewer). The decrement runs inside the same Mongo transaction as the
approval increment (`reviewAnswer` passes the session to
`updateReputationScore`) and uses an atomic aggregation-pipeline update.

**Scope of the claim:** I4 establishes ledger consistency — no lost or
phantom reputation updates under simultaneous review landings. It does *not*
claim the committed reviews are valid: when Finding 2 lets a duplicate
review commit, the reputation counter faithfully follows that invalid
review. So reputation correctness is bounded by review-commit correctness —
fix the per-reviewer idempotency bug and the ledger, which tracks commits
exactly, is correct too.

### Finding 5 (scoping) — cosine similarity is not a backend-local concurrency surface

The brief asks whether "the cosine similarity check holds up under parallel
computation". Inspection shows the backend's local
`utils/cosine-similarity.ts` has **no call sites**; all similarity/duplicate
helper exists but is dead code (imported once, never invoked); all
similarity/duplicate checks in the question pipeline delegate to *external*
services
(`QuestionService.runDuplicateCheckPipeline` → `searchGdb` /
`checkPendingDuplicate` / LLM concept check), gated behind
`ENABLE_AI_SERVER`. There is no in-process parallel cosine computation to
load-test; the relevant load risk is the throughput/latency of the external
AI/GDB services, which is out of scope for a self-contained local suite (and
would need those services' staging endpoints to measure meaningfully).

### Finding 6 (LOW) — stale-assignment rejection holds under concurrency

`python race_probe.py --mode multi` races reviews from reviewers whose
assignment has been superseded (only the latest history assignee is authorized
by design — the assignment model never authorizes two reviewers at once).
Across all rounds only the currently assigned reviewer's submission committed;
no state corruption. The failure mode is availability (raced requests get
500s rather than a clean 401/409), not correctness.

### Finding 7 (HIGH, reproduced) — manual expert allocation dedupe/cap guard fails under concurrency

Reproduce: `python race_probe.py --mode allocation --shots 6 --rounds 6`

`QuestionService.allocateExperts` validates "expert already in queue" and the
10-expert cap by reading the submission inside its transaction and checking
in application code (check-then-act). Under concurrent allocation requests
for the **same expert**, multiple transactions read the same snapshot, all
pass the dedupe check, and all commit their `$push` — the queue ends with
**3–5 copies of the same expert** (observed in every duplicate-expert round;
`queueLen=5, queueUnique=1` at 6 and 14 concurrent shots). The 10-expert cap
was probed separately with a near-cap fixture (queue pre-seeded to 9, six
concurrent distinct adds): it **held at exactly 10** in every round — the
racing transactions' conflicting writes on the submission document serialize
the commits, and losers surface as 400 ("cannot allocate more than 10") or
opaque 500s. The reproduced defect is therefore the dedupe guard, not the cap.

Consequences: a duplicated expert is handed the same question multiple
times by queue-position logic, and slots for other experts are consumed.
Fix shape: same as Finding 2 — enforce uniqueness in the database
(`$addToSet` instead of `$push`, or a guarded update
`{_id, queue: {$ne: expertId}, $expr: {$lt: [{$size: "$queue"}, 10]}}`)
so the constraint holds regardless of snapshot timing.

Two correctness properties **did** hold in all rounds:
- **A3 (workload grant)** — with an initially empty queue, exactly one
  expert received a first-allocation workload grant of exactly +1
  regardless of how many allocations raced (the probe checks both the
  recipient count and the grant magnitude); with a pre-seeded queue,
  zero grants were issued, as expected.
- **SLA** — every allocation call completed in < 0.3 s, far inside the
  brief's 30 s allocation target. (Local scope note: production
  auto-allocation runs as an external cron/job every minute; this measures
  the allocation operation itself, not the cron scheduling delay.)

Under **distinct-expert** concurrency the guard state stays consistent, but
availability suffers: only 1–3 of 6–14 concurrent allocations commit; the
rest fail as opaque 500s (write-conflict retries defeated by error
wrapping — same root cause as Finding 3).

### Finding 8 (verified OK) — moderator gate holds under simultaneous approvals

Reproduce: `python race_probe.py --mode moderator --shots 4 --rounds 3`

The probe drives an answer to promotion (3 accepted reviews →
`pending-with-moderator`), then fires 4 concurrent final approvals for the
same answer across different moderator accounts. In every round:

- **M1** the question ended exactly `closed` (never double-closed or stuck);
- **M2** the answer ended `approved` + `isFinalAnswer` with `approvedBy` set
  (all three fields asserted);
- **M3** the author's incentive was incremented **exactly once** — no double
  payout even when approvals landed simultaneously;
- **M4** exactly one of the concurrent approvals returned success (asserted,
  not just observed — a second 200 in the race window would be flagged,
  since it could only come from the closed-question edit path).

The losing approvals fail with opaque 500s (the Finding 3 error-wrapping
pattern) rather than a clean 409, so the gate's correctness holds but its
concurrent failure mode is indistinguishable from a server fault to the
client. Scope: the probe asserts M1–M4 (final state + single success); it
does not exercise the closed-question edit or push-to-GDB flows. Setup note: the probe pre-registers the
question's state/district in the LGD reference collections and sets
`details.normalised_crop`, since the approval path hard-blocks on both.

## 3. SLA recommendations

Based on the observed knee points (single-machine baseline):

| Metric | Proposed SLA | Observed at 1x | Breaks at |
|---|---|---|---|
| Expert login → queue visible | p95 < 500 ms | 29 ms | ~10x (1.1 s) |
| Question ingestion | p95 < 200 ms | 21 ms | not reached (10x OK) |
| Review submission | p95 < 1 s, error rate < 1% | 57 ms / 0% | 5x (810 ms / ~2%) |
| Review cycle completion (3 approvals) | > 99% | 100% | 5x (94%) |
| Expert allocation (manual endpoint) | < 30 s per brief; p95 < 1 s proposed | < 0.3 s | not reached (correctness breaks first — Finding 7) |
| Moderator final approval | p95 < 1 s | < 0.2 s | not reached (gate holds — Finding 8) |

## 4. Reproducing

```bash
python seed_users.py --experts 60 --moderators 3 --farmers 5
./run_sla.sh 90s                          # SLA matrix -> results/*.csv
python race_probe.py --mode deadlock   --rounds 2            # Finding 1
python race_probe.py --mode duplicate  --shots 8 --rounds 5  # Finding 2
python race_probe.py --mode reputation --shots 4 --rounds 6  # Finding 4
python race_probe.py --mode multi      --shots 6 --rounds 8  # Finding 6
python race_probe.py --mode allocation --shots 6 --rounds 6  # Finding 7
python race_probe.py --mode moderator  --shots 4 --rounds 3  # Finding 8
```

Notes: the Locust scenarios run single-process; the account-pool round-robin
is thread-safe within one worker but not coordinated across distributed
workers.
