# Question Ingestion — E2E Test Flow

Covers `WhatsAppQuestion.e2e.test.ts` (**WA**, 18 tests) and `AjrasakhaQuestion.e2e.test.ts` (**AJ**, 9 tests).

> **To preview this diagram locally:** install the VS Code extension  
> **"Markdown Preview Mermaid Support"** then press `Ctrl+Shift+V`.  
> It also renders natively on GitHub.

---

```mermaid
flowchart TD

  classDef wa      fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,font-weight:bold
  classDef aj      fill:#dcfce7,stroke:#16a34a,color:#14532d,font-weight:bold
  classDef shared  fill:#f8fafc,stroke:#94a3b8,color:#334155
  classDef ok      fill:#d1fae5,stroke:#059669,color:#064e3b
  classDef err     fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
  classDef warn    fill:#fef9c3,stroke:#d97706,color:#78350f
  classDef decide  fill:#faf5ff,stroke:#7c3aed,color:#3b0764

  %% ── ENTRY POINTS ───────────────────────────────────────────────────────
  subgraph ENTRY ["① Entry  —  source-specific"]
    direction LR
    WA["📱  WhatsApp webhook
    ──────────────────
    Auth: x-internal-api-key
    userId: body.userId"]:::wa

    AJ["🌐  Webapp user
    ──────────────────
    Auth: Bearer Firebase JWT
    userId: @CurrentUser._id"]:::aj
  end

  WA -- "❌ missing / wrong key
  ✓ WA  ✓ AJ" --> E401["401 Unauthorized"]:::err

  AJ -- "❌ missing / wrong key
  ✓ WA  ✓ AJ" --> E401

  %% ── SYNC INGESTION ─────────────────────────────────────────────────────
  WA -- "✅ auth passed" --> ADDQ
  AJ -- "✅ auth passed" --> ADDQ

  subgraph SYNC ["② Synchronous  —  addQuestion()"]
    ADDQ["source = WHATSAPP or AJRASAKHA
    priority  = 'high'   ← forced for both
    status    = 'pending'
    isAutoAllocate = false
    ─────────────────────────────────────
    WA  → userId from body.userId
    AJ  → userId from @CurrentUser._id   ✓ AJ"]:::shared

    ADDQ -- "❌ empty question
    ✓ WA  ✓ AJ  ⚠ bug: 500 not 400" --> E500["500
    (should be 400)"]:::err

    ADDQ -- "❌ missing detail field
    ✓ WA  ✓ AJ" --> E400["400 BadRequestError"]:::err

    ADDQ -- "✅ valid payload" --> EMBED["AiService.getEmbedding
    ← dummied"]:::shared

    EMBED --> SAVE["save question + bare submission
    ──────────────────────────────
    → return 201 { question_id }
    → kick off setImmediate"]:::shared
  end

  %% ── BACKGROUND PIPELINE ────────────────────────────────────────────────
  SAVE --> THREAD

  subgraph BG ["③ Background  —  processQuestionInBackground()  via setImmediate"]

    THREAD{"threadId
    present?"}:::decide

    THREAD -- "❌ empty / missing
    ✓ WA  ✓ AJ" --> TESTING["isTesting = true
    status stays 'pending'
    pipeline stops"]:::err

    THREAD -- "✅ non-empty" --> FETCH["AiService.fetchWhatsAppMessage
    ← dummied
    ─────────────────────────────────────────
    same call for WHATSAPP and AJRASAKHA
    when threadId is set"]:::shared

    FETCH -- "❌ 'not found' after all retries
    hadSuccessfulApiCall = true
    ✓ WA  (not repeated in AJ)" --> TESTING

    FETCH -- "⚡ API completely unreachable
    hadSuccessfulApiCall = false → proceeds
    ✓ WA  (not repeated in AJ)" --> GDB

    FETCH -- "✅ message found" --> GDB

    GDB["AiService.searchGdb
    ← dummied"]:::shared

    GDB -- "exact_match  valid ObjectId
    ✓ WA  ✓ AJ" --> DUP_E["status = 'duplicate'
    isExact = true
    referenceQuestionId set"]:::ok

    GDB -- "selected_match  valid ObjectId
    ✓ WA  (not repeated in AJ)" --> DUP_S["status = 'duplicate'
    isExact = false
    referenceSource = 'reviewer'"]:::ok

    GDB -- "❌ searchGdb throws → proceeds
    ✓ WA  (not repeated in AJ)" --> OPEN

    GDB -- "no match" --> LLM["checkConceptDuplicate
    LLM non-agri classifier
    ← mocked"]:::shared

    LLM -- "isNonAgri = true
    ✓ WA  ✓ AJ" --> NONAGRI["status = 'non_agri'"]:::warn

    LLM -- "isNonAgri = false
    ✓ WA  ✓ AJ" --> OPEN["status = 'open'"]:::ok

    LLM -- "❌ LLM throws → proceeds
    ✓ WA  ✓ AJ" --> OPEN

    OPEN --> NSPLIT{"source?"}:::decide

    NSPLIT -- "WHATSAPP" --> NWA["notify moderators
    type = 'question_from_whatsapp'"]:::wa

    NSPLIT -- "AJRASAKHA
    ✓ AJ" --> NAJ["notify moderators
    type = 'question_from_ajrasakha'"]:::aj

  end

  %% ── EXTRA WA-ONLY EDGE CASES (footnote nodes) ─────────────────────────
  subgraph EXTRAS ["④ Additional edge cases  —  WhatsApp suite only"]
    direction LR
    X1["Thread: transient failure
    → retry succeeds → open
    ✓ WA"]:::wa
    X2["GDB exact_match
    invalid ObjectId
    → falls through to LLM
    ✓ WA"]:::wa
    X3["GDB selected_match
    invalid ObjectId
    → falls through to LLM
    ✓ WA"]:::wa
    X4["GDB exact_match
    in {$$oid} format
    → duplicate
    ✓ WA"]:::wa
    X5["GDB both exact + selected
    → exact_match wins
    ✓ WA"]:::wa
  end
```

---

## Coverage table

| Step | WA | AJ | Note |
|------|:--:|:--:|------|
| Auth: no header / wrong key → 401 | ✓ | ✓ | Different auth mechanism per source |
| Payload: missing detail field → 400 | ✓ | ✓ | |
| Payload: empty question → 500 (bug) | ✓ | ✓ | Should be 400; same root cause |
| userId from `@CurrentUser` (not body) | — | ✓ | AJRASAKHA-specific |
| source / priority / isAutoAllocate values | — | ✓ | AJRASAKHA-specific |
| Thread: empty threadId → isTesting | ✓ | ✓ | |
| Thread: fetchWhatsAppMessage succeeds → pipeline runs | ✓ | ✓ | Confirms shared wiring per source |
| Thread: "not found" after all retries → isTesting | ✓ | — | Retry logic is source-agnostic |
| Thread: API completely unreachable → open | ✓ | — | Source-agnostic |
| Thread: transient failure, retry succeeds → open | ✓ | — | Source-agnostic |
| GDB: exact_match → duplicate, isExact=true | ✓ | ✓ | |
| GDB: selected_match → duplicate, isExact=false | ✓ | — | Source-agnostic |
| GDB: both exact+selected → exact wins | ✓ | — | Source-agnostic |
| GDB: invalid exact_match ObjectId → LLM fallthrough | ✓ | — | Source-agnostic |
| GDB: invalid selected_match ObjectId → LLM fallthrough | ✓ | — | Source-agnostic |
| GDB: exact_match in `{$oid}` format → duplicate | ✓ | — | Source-agnostic |
| GDB: throws → open | ✓ | — | Source-agnostic |
| LLM: non-agri → non_agri | ✓ | ✓ | |
| LLM: agri → open | ✓ | ✓ | |
| LLM: throws → open (degrade) | ✓ | ✓ | |
| Notification: `question_from_whatsapp` | ✓ | — | |
| Notification: `question_from_ajrasakha` | — | ✓ | |

---

## How to run

```bash
# From backend/

# WhatsApp (18 tests, ~59 s — three long retry tests dominate)
pnpm exec vitest run src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts

# Ajrasakha (9 tests, ~7 s)
pnpm exec vitest run src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts

# Both together
pnpm exec vitest run src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts
```
