# Post-Allocation Review Workflow — E2E Test Flow

Covers `PostAllocation.e2e.test.ts` (**24 tests**). This suite begins where
allocation ends — a question whose submission already has a populated `queue`
(manual allocation → `ManualAllocation.e2e.test.ts`, auto allocation →
`QuestionAutoAllocation.e2e.test.ts`) — and drives it through the full
expert peer-review → moderator-approval state machine.

> **To preview this diagram locally:** install the VS Code extension
> **"Markdown Preview Mermaid Support"** then press `Ctrl+Shift+V`.
> It also renders natively on GitHub.

---

```mermaid
flowchart TD

  classDef entry   fill:#ede9fe,stroke:#7c3aed,color:#3b0764,font-weight:bold
  classDef expert  fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
  classDef mod      fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef ok      fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef err     fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  classDef warn    fill:#fef9c3,stroke:#d97706,color:#78350f
  classDef decide  fill:#faf5ff,stroke:#7c3aed,color:#3b0764

  START["✅ Question ALLOCATED
  status = 'open'
  submission.queue = [e1, e2, e3, e4]
  history = []"]:::entry

  %% ── AUTHORIZATION GUARDS (POST /answers/review) ──────────────────────
  START --> GUARD{"who is calling
  POST /answers/review ?"}:::decide

  GUARD -- "no user" --> G401["401 Unauthorized"]:::err
  GUARD -- "role ∉ {expert, pae_expert}
  ⚠ wrapped → 500 (KNOWN)" --> G500["500
  (UnauthorizedError wrapped
  as InternalServerError)"]:::err
  GUARD -- "expert ≠ queue[0]
  on first answer
  ⚠ wrapped → 500 (KNOWN)" --> G500

  GUARD -- "expert = queue[0]" --> FIRST

  %% ── FIRST SUBMISSION (no status) ─────────────────────────────────────
  subgraph AUTHOR ["① Author submits first answer  —  POST /answers/review  (no status)"]
    FIRST["e1 submits answer
    ─────────────────────────
    answer.status = 'in-review'
    submission.history += e1 entry
    totalAnswersCount += 1"]:::expert

    FIRST --> PAEQ{"e1 role =
    pae_expert ?"}:::decide

    PAEQ -- "yes" --> PAE["question.status = 'pae_submitted'
    ⟶ peer cycle SKIPPED
    workload decremented"]:::warn

    PAEQ -- "no (expert)" --> ASSIGN2["next in queue (e2) assigned
    history += e2 'in-review' entry
    e2 notified  type='peer_review'
    question stays 'open'"]:::expert

    FIRST -. "e1 submits again
    ⚠ 'already submitted' → 500 (KNOWN)" .-> DUP500["500"]:::err
  end

  %% ── PEER REVIEW CYCLE (status set) ───────────────────────────────────
  ASSIGN2 --> REVIEW{"reviewer action
  status = ?"}:::decide

  subgraph PEER ["② Peer review cycle  —  POST /answers/review  (status set)"]

    REVIEW -- "accepted
    approvedAnswer = live answer" --> ACC["approvalCount += 1
    reviewer history → 'reviewed'"]:::expert

    ACC --> ACCQ{"approvalCount ≥ 3
    OR 10 reviews ?"}:::decide
    ACCQ -- "no" --> NEXT["assign next queued expert
    notify type='peer_review'"]:::expert
    NEXT --> REVIEW
    ACCQ -- "yes (3 approvals)" --> READY["answer.status='pending-with-moderator'
    question.status = 'in-review'
    moderators + admins notified
    type='moderator_approval'"]:::ok

    REVIEW -- "rejected (+ new answer)" --> REJ["author penalised
    old answer.status='rejected'
    reviewer's new answer = live (in-review)
    author notified type='review_rejected'"]:::warn
    REJ -. "identical answer
    ⚠ guard → 500 (KNOWN)" .-> RJ500["500"]:::err
    REJ --> REVIEW

    REVIEW -- "modified" --> MOD["answer text updated in place
    approvalCount reset to 0
    modifications[] appended
    author notified type='review_modified'"]:::warn
    MOD -. "identical answer
    ⚠ guard → 500 (KNOWN)" .-> MD500["500"]:::err
    MOD --> REVIEW
  end

  %% ── MODERATOR APPROVAL ───────────────────────────────────────────────
  READY --> MAPPROVE{"PUT /answers
  who & question state?"}:::decide
  PAE --> MAPPROVE

  subgraph MODERATOR ["③ Moderator approval  —  PUT /answers"]
    MAPPROVE -- "role = expert
    → 400" --> M400a["400 (role gate)"]:::err
    MAPPROVE -- "question still 'open'
    (not in-review / pae_submitted) → 400" --> M400b["400"]:::err
    MAPPROVE -- "no normalised_crop → 400" --> M400c["400"]:::err

    MAPPROVE -- "moderator/admin
    + question in-review / pae_submitted
    + normalised_crop present" --> CLOSE["question.status = 'closed'
    closedAt set
    answer.isFinalAnswer = true
    answer.status = 'approved'
    author INCENTIVISED
    ─────────────────────────────
    WHATSAPP / AJRASAKHA → webhook
    notifies the farmer"]:::ok
  end

  %% ── POST-CLOSE OPERATIONS ────────────────────────────────────────────
  subgraph EXTRAS ["④ Post-close / side operations"]
    direction LR
    EDIT["Edit-final flow
    PUT /answers on a CLOSED question
    w/ a final answerId
    → text/sources updated,
    isFinalAnswer preserved,
    stays 'closed'"]:::mod
    LLM["POST /answers/moderator/approve
    source ∉ {AJRASAKHA, WHATSAPP}
    → 400"]:::err
    DEL["DELETE /answers/:qId/:aId
    non-final answer
    → answer removed,
    totalAnswersCount −−"]:::mod
    LATE["POST /answers/review on
    a CLOSED question
    ⚠ 'already closed' → 500 (KNOWN)"]:::err
  end

  CLOSE --> EDIT
```

---

## The reviewAnswer error-mapping quirk (KNOWN)

`AnswerService.reviewAnswer` wraps its **entire** body in a `try/catch` and
rethrows every error as `InternalServerError`. The controller then re-throws
`InternalServerError` as HTTP **500**. So *every* failure inside the peer-review
endpoint (wrong role, wrong reviewer, duplicate submission, identical-answer
guard, closed question…) surfaces as **500** — never 400/401/403.

`approveAnswer` (PUT `/answers`) does **not** have this quirk: its role/state
guards correctly surface as **400**.

These are pinned as expected results in the suite and flagged `KNOWN`.

---

## Coverage table

| # | Scenario | Endpoint | Expected |
|---|----------|----------|:--------:|
| 1 | No user logged in | `POST /answers/review` | 401 |
| 2 | Moderator tries to author/review | `POST /answers/review` | 500 (KNOWN) |
| 3 | Expert not at `queue[0]` submits first | `POST /answers/review` | 500 (KNOWN) |
| 4 | `queue[0]` submits first answer → in-review, `queue[1]` assigned | `POST /answers/review` | 201 |
| 5 | Same author submits twice | `POST /answers/review` | 500 (KNOWN) |
| 6 | `queue[1]` accepts → approvalCount 1, `queue[2]` assigned | `POST /answers/review` | 201 |
| 7 | `queue[2]` accepts → approvalCount 2, `queue[3]` assigned | `POST /answers/review` | 201 |
| 8 | `queue[3]` accepts → 3 approvals → question `in-review` | `POST /answers/review` | 201 |
| 9 | Expert attempts final approval | `PUT /answers` | 400 |
| 10 | Moderator approves → `closed`, final answer, author incentivised | `PUT /answers` | 200 |
| 11 | Add answer to a closed question | `POST /answers/review` | 500 (KNOWN) |
| 12 | Reject with identical answer | `POST /answers/review` | 500 (KNOWN) |
| 13 | Reject with new answer → old rejected, author penalised, notified | `POST /answers/review` | 201 |
| 14 | Author notified `review_rejected` | (DB) | ✓ |
| 15 | Modify with identical answer | `POST /answers/review` | 500 (KNOWN) |
| 16 | Modify → text updated in place, approvalCount reset 0 | `POST /answers/review` | 201 |
| 17 | Author notified `review_modified` | (DB) | ✓ |
| 18 | Approve when question still `open` | `PUT /answers` | 400 |
| 19 | Approve when no `normalised_crop` | `PUT /answers` | 400 |
| 20 | LLM approve with non AJRASAKHA/WHATSAPP source | `POST /answers/moderator/approve` | 400 |
| 21 | Edit already-finalised answer on closed question | `PUT /answers` | 200 |
| 22 | PAE expert submits → `pae_submitted` (peer skipped)¹ | `POST /answers/review` | 201 |
| 23 | Moderator approves a `pae_submitted` question → `closed`¹ | `PUT /answers` | 200 |
| 24 | Delete non-final answer → removed, count decremented | `DELETE /answers/:qId/:aId` | 200 |

¹ PAE cases self-`skip()` if no `pae_expert` user exists in the DB.

---

## How to run

```bash
# From backend/  (~19 s against the real Atlas DB in .env)
pnpm exec vitest run src/e2e/post-allocation/PostAllocation.e2e.test.ts
```

The suite seeds every question it needs (tagged `E2E_PA_<ts>`) and deletes all
seeded questions, submissions, answers, reviews and notifications in `afterAll`.
