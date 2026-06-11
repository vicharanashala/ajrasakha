# Question Ingestion — E2E Test Flow

Covers `WhatsAppQuestion.e2e.test.ts` (18 tests) and `AjrasakhaQuestion.e2e.test.ts` (9 tests).

---

## WhatsApp flow

```
  WhatsApp webhook
  x-internal-api-key header
  userId: body.userId
          |
          v
  < FlexibleAuth >----- missing / wrong key -----> 401   [WA: tested]
          |
          | key valid
          v
  [ addQuestion() ]
    source = WHATSAPP
    priority = 'high'  (forced)
    status  = 'pending'
    isAutoAllocate = false
    |          |          |
    |          |          +-- empty question -------> 500  [WA: tested, known bug]
    |          +------------- missing detail field -> 400  [WA: tested]
    |
    | valid payload
    v
  [ AiService.getEmbedding ]   <-- dummied
    |
    v
  [ save question + bare submission to MongoDB ]
    |
    +-------> 201 { question_id }
    |
    v
  [ processQuestionInBackground() ]   (setImmediate)
    |
    v
  < threadId present? >
    |                 |
    | empty           | non-empty
    v                 v
  isTesting=true    [ AiService.fetchWhatsAppMessage ]   <-- dummied
  [WA: tested]        |             |              |
                      |             |              |
              "not found"     API completely    success
              all retries       unreachable         |
              [WA: tested]     [WA: tested]         |
                      |             |               |
               isTesting=true       |               |
                                    +---------------+
                                    |
                                    v
                          [ runDuplicateCheckPipeline() ]
                          [ AiService.searchGdb ]   <-- dummied
                            |           |           |           |
                     exact_match  selected_match  no match   throws
                     valid ObjId  valid ObjId        |      [WA: tested]
                     [WA: tested] [WA: tested]       |           |
                          |           |              v           |
                      duplicate   duplicate  [ checkConceptDuplicate ]  <-- mocked
                      isExact=T   isExact=F    |           |        |
                                           non-agri      agri    throws
                                           [WA: tested] (below) [WA: tested]
                                               |           |        |
                                           non_agri        +--------+
                                                           |
                                                           v
                                                         open
                                                           |
                                                           v
                                              [ notify moderators ]
                                              type = 'question_from_whatsapp'

  Additional edge cases tested (WhatsApp only):
    - thread: transient failure then retry succeeds -> open       [WA: tested]
    - GDB: exact_match has invalid ObjectId -> falls through LLM  [WA: tested]
    - GDB: selected_match has invalid ObjectId -> falls through    [WA: tested]
    - GDB: exact_match in {$oid} format -> duplicate              [WA: tested]
    - GDB: both exact+selected present -> exact wins              [WA: tested]
```

---

## Ajrasakha flow

```
  Webapp user (browser)
  Authorization: Bearer <Firebase JWT>
  userId: @CurrentUser()._id   <-- from authenticated user, NOT body
          |
          v
  < FlexibleAuth >----- missing / wrong key -----> 401   [AJ: tested]
          |
          | auth valid
          v
  [ addQuestion() ]
    source = AJRASAKHA
    priority = 'high'  (forced)
    status  = 'pending'
    isAutoAllocate = false
    userId = currentUser._id   <-- AJRASAKHA-specific
    |          |          |
    |          |          +-- empty question -------> 500  [AJ: tested, known bug]
    |          +------------- missing detail field -> 400  [AJ: tested]
    |
    | valid payload
    v
  [ AiService.getEmbedding ]   <-- dummied
    |
    v
  [ save question + bare submission to MongoDB ]
    |
    +-------> 201 { question_id }
    |
    v
  [ processQuestionInBackground() ]   (setImmediate)
    |
    v
  < threadId present? >
    |                 |
    | empty           | non-empty
    v                 v
  isTesting=true    [ AiService.fetchWhatsAppMessage ]   <-- dummied
  [AJ: tested]        |                          |
                      |                          |
              "not found" / API down           success
              (same logic as WhatsApp)            |
              [not repeated in AJ suite]          |
                                                  v
                                        [ runDuplicateCheckPipeline() ]
                                        [ AiService.searchGdb ]   <-- dummied
                                          |           |           |
                                   exact_match     no match    throws
                                   valid ObjId        |       (falls to open)
                                   [AJ: tested]       |
                                        |      [ checkConceptDuplicate ]  <-- mocked
                                    duplicate     |           |       |
                                    isExact=T   non-agri    agri   throws
                                              [AJ: tested] (below) [AJ: tested]
                                                  |           |       |
                                               non_agri       +-------+
                                                              |
                                                              v
                                                            open
                                          Verify: source='AJRASAKHA'      [AJ: tested]
                                                  priority='high'         [AJ: tested]
                                                  isAutoAllocate=false    [AJ: tested]
                                                  userId=currentUser._id  [AJ: tested]
                                                              |
                                                              v
                                                 [ notify moderators ]
                                                 type = 'question_from_ajrasakha'
                                                 [AJ: tested]

  Steps from the shared pipeline NOT repeated in AJ suite:
    - thread: "not found" after all retries -> isTesting
    - thread: API completely unreachable -> open
    - thread: transient failure then retry succeeds -> open
    - GDB: selected_match branch
    - GDB: exact_match / selected_match invalid ObjectId fallthrough
    - GDB: {$oid} format handling
    - GDB: both exact+selected -> exact wins
    - GDB: throws -> open
```

---

## Coverage table

| Step | WhatsApp suite | Ajrasakha suite |
|------|:--------------:|:---------------:|
| Auth: no header / wrong key → 401 | ✓ | ✓ |
| Payload: missing detail field → 400 | ✓ | ✓ |
| Payload: empty question → 500 (bug) | ✓ | ✓ |
| AJRASAKHA fields: userId from @CurrentUser | — | ✓ |
| AJRASAKHA fields: source / priority / isAutoAllocate | — | ✓ |
| Thread: empty threadId → isTesting | ✓ | ✓ |
| Thread: fetchWhatsAppMessage success → pipeline runs | ✓ | ✓ |
| Thread: "not found" after all retries → isTesting | ✓ | — |
| Thread: API completely unreachable → open | ✓ | — |
| Thread: transient failure, retry succeeds → open | ✓ | — |
| GDB: exact_match → duplicate, isExact=true | ✓ | ✓ |
| GDB: selected_match → duplicate, isExact=false | ✓ | — |
| GDB: both exact+selected → exact wins | ✓ | — |
| GDB: invalid exact_match ObjectId → LLM fallthrough | ✓ | — |
| GDB: invalid selected_match ObjectId → LLM fallthrough | ✓ | — |
| GDB: exact_match in {$oid} format → duplicate | ✓ | — |
| GDB: searchGdb throws → open | ✓ | — |
| LLM: non-agri → non_agri | ✓ | ✓ |
| LLM: agri → open | ✓ | ✓ |
| LLM: throws → open (degrade) | ✓ | ✓ |
| Notification type: question_from_whatsapp | ✓ | — |
| Notification type: question_from_ajrasakha | — | ✓ |

---

## How to run

```bash
# From backend/

# WhatsApp (18 tests, ~59 s — includes three long retry tests)
pnpm exec vitest run src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts

# Ajrasakha (9 tests, ~7 s)
pnpm exec vitest run src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts

# Both together
pnpm exec vitest run src/e2e/whatsapp/WhatsAppQuestion.e2e.test.ts src/e2e/ajrasakha/AjrasakhaQuestion.e2e.test.ts
```
