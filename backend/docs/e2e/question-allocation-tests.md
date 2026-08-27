# QUESTION-AUTO-ALLOCATE-001

## Title

Automatically allocate AGRI_EXPERT question to exactly one expert

---

## Objective

Verify that when an AGRI_EXPERT question is created, the automatic allocation workflow executes successfully and assigns the question to exactly one expert queue.

This test validates the end-to-end auto-allocation process without making assumptions about which specific expert receives the question.

---

## Business Requirement

When a new AGRI_EXPERT question is submitted:

1. The question should be created successfully.
2. Background allocation processing should execute.
3. Expert matching logic should determine the most suitable expert.
4. The question should be assigned to exactly one expert queue.
5. The assigned expert should be able to view the question through the allocated questions endpoint.

---

## APIs Covered

### Create Question

```http
POST /api/questions
```

### Get Allocated Questions

```http
POST /api/questions/allocated
```

---

## Preconditions

### User Setup

- Moderator account exists and is active.
- Expert test accounts exist and are active.
- Expert accounts are not blocked.

### Expert Accounts

```text
experttest1@annam.ai
experttest2@annam.ai
experttest3@annam.ai
experttest4@annam.ai
experttest5@annam.ai
experttest6@annam.ai
experttest7@annam.ai
experttest8@annam.ai
```

### System Setup

- Auto-allocation workflow is enabled.
- Background processing is running successfully.
- Question submission records are being created.
- Expert allocation queue updates are functioning correctly.

### Master Data

The crop used in the test must exist in crop master:

```text
Brinjal
```

---

## Test Data

```json
{
  "question": "Auto Allocation <timestamp>",
  "priority": "medium",
  "source": "AGRI_EXPERT",
  "details": {
    "state": "Punjab",
    "district": "Ludhiana",
    "crop": "Brinjal",
    "season": "Rabi",
    "domain": "Crop Protection"
  }
}
```

---

## Test Steps

### Step 1

Login as moderator.

### Step 2

Create a new AGRI_EXPERT question.

Expected:

```http
201 Created
```

Response contains:

```json
{
  "success": true,
  "question_id": "<questionId>"
}
```

---

### Step 3

Capture the created question ID.

---

### Step 4

Allow background auto-allocation processing to complete.

The allocation process runs asynchronously after question creation.

---

### Step 5

Login as each expert account.

For every expert:

```http
POST /api/questions/allocated
```

Query:

```text
page=1
limit=100
review_level=Author
```

---

### Step 6

Search allocated question results for the newly created question ID.

---

### Step 7

Count the number of experts that can see the question.

---

## Expected Results

### Question Creation

Question is created successfully.

### Auto Allocation

Question is allocated automatically.

### Queue Assignment

Exactly one expert can see the question in their allocated queue.

### Allocation Count

```text
Allocated Experts Count = 1
```

---

## Validation Rules

### Validation 1

Question creation succeeds.

```text
HTTP 201
```

---

### Validation 2

Question ID is returned.

```text
question_id is not null
```

---

### Validation 3

At least one expert receives the question.

```text
allocatedExperts.length > 0
```

---

### Validation 4

Only one expert receives the question.

```text
allocatedExperts.length === 1
```

This validates:

```ts
DEFAULT_AUTO_ALLOCATE_EXPERTS_COUNT = 1;
```

---

## Success Criteria

The test passes when:

1. Question creation succeeds.
2. Background allocation completes.
3. The created question appears in an allocated queue.
4. Exactly one expert can view the question.

---

## Defects Detected By This Test

### Allocation Not Triggered

Question never appears in any expert queue.

### Queue Update Failure

Question created successfully but submission queue remains empty.

### Multi-Allocation Defect

Question appears for multiple experts simultaneously.

### Expert Visibility Defect

Question is allocated internally but does not appear in the expert allocated questions endpoint.

---

## Notes

This test intentionally does not validate which specific expert receives the question.

The allocation algorithm uses expert preferences, reputation score, and matching criteria. Because expert selection can vary depending on current configuration and data, this test focuses solely on verifying that automatic allocation occurs and results in a single assignment.

Expert-selection logic will be validated separately in dedicated allocation scoring tests.

# QUESTION-AUTO-ALLOCATE-002

## Title

Allocate question to highest scoring expert

---

## Objective

Verify that the auto-allocation engine assigns a newly created AGRI_EXPERT question to the expert with the highest preference match score.

This test validates the expert scoring and ranking logic used during automatic allocation.

---

## Business Requirement

When a new AGRI_EXPERT question is submitted:

1. The system should evaluate all available experts.
2. Each expert should receive a score based on preference matching.
3. Experts should be ranked according to the allocation algorithm.
4. The highest scoring expert should receive the allocation.
5. Only one expert should receive the question.

---

## APIs Covered

### Create Question

```http
POST /api/questions
```

### Get Allocated Questions

```http
POST /api/questions/allocated
```

---

## Allocation Logic Under Test

### Expert Preference Scoring

| Preference Match | Score |
| ---------------- | ----- |
| State Match      | +3    |
| Domain Match     | +2    |
| Crop Match       | +1    |

---

### Tie Breaking

If multiple experts receive the same score:

```ts
return a.workloadScore - b.workloadScore;
```

The expert with the lower reputation score (workload score) is selected.

---

## Test Data

### Question

```json
{
  "question": "Allocation Score Test",
  "priority": "medium",
  "source": "AGRI_EXPERT",
  "details": {
    "state": "Punjab",
    "district": "Ludhiana",
    "crop": "Brinjal",
    "season": "Rabi",
    "domain": "Crop Protection"
  }
}
```

---

## Expert Configuration

### Expert 1

```json
{
  "email": "experttest1@annam.ai",
  "preference": {
    "state": "Punjab",
    "crop": "all",
    "domain": "all"
  },
  "reputation_score": 2
}
```

Expected Score:

```text
State Match = +3
Crop Match = 0
Domain Match = 0

Total Score = 3
```

---

### Expert 2

```json
{
  "email": "experttest2@annam.ai",
  "preference": {
    "state": "all",
    "crop": "Brinjal",
    "domain": "all"
  },
  "reputation_score": 4
}
```

Expected Score:

```text
State Match = 0
Crop Match = +1
Domain Match = 0

Total Score = 1
```

---

### Expert 3

```json
{
  "email": "experttest3@annam.ai",
  "preference": {
    "state": "all",
    "crop": "all",
    "domain": "Disease Management"
  }
}
```

Expected Score:

```text
State Match = 0
Crop Match = 0
Domain Match = 0

Total Score = 0
```

---

### Experts 4-8

```json
{
  "preference": {
    "state": "all",
    "crop": "all",
    "domain": "all"
  }
}
```

Expected Score:

```text
Total Score = 0
```

---

## Expected Ranking

| Rank | Expert                                                  | Score |
| ---- | ------------------------------------------------------- | ----- |
| 1    | [experttest1@annam.ai](mailto:experttest1@annam.ai)     | 3     |
| 2    | [experttest2@annam.ai](mailto:experttest2@annam.ai)     | 1     |
| 3    | [experttest3@annam.ai](mailto:experttest3@annam.ai)     | 0     |
| 4-8  | [experttest4-8@annam.ai](mailto:experttest4-8@annam.ai) | 0     |

---

## Test Steps

### Step 1

Login as moderator.

---

### Step 2

Create a new AGRI_EXPERT question using the test data.

Expected:

```http
201 Created
```

---

### Step 3

Capture the generated question ID.

---

### Step 4

Allow asynchronous background allocation processing to complete.

The allocation process runs through:

```text
processQuestionInBackground()
↓
findExpertsByPreference()
↓
sort experts by score
↓
allocate highest ranked expert
↓
updateQueue()
```

---

### Step 5

Query allocated questions for all expert test accounts.

---

### Step 6

Identify which expert received the created question.

---

## Expected Results

### Allocation

The question is allocated successfully.

### Assigned Expert

```text
experttest1@annam.ai
```

receives the question.

### Non-Assigned Experts

```text
experttest2@annam.ai
experttest3@annam.ai
experttest4@annam.ai
experttest5@annam.ai
experttest6@annam.ai
experttest7@annam.ai
experttest8@annam.ai
```

do not receive the question.

---

## Validation Rules

### Validation 1

Question creation succeeds.

```text
HTTP 201
```

---

### Validation 2

Question ID is returned.

```text
question_id is not null
```

---

### Validation 3

Exactly one expert receives the question.

```text
allocatedExperts.length === 1
```

---

### Validation 4

The allocated expert is:

```text
experttest1@annam.ai
```

---

## Success Criteria

The test passes when:

1. Question creation succeeds.
2. Auto-allocation completes.
3. Only one expert receives the question.
4. The receiving expert is the highest scoring expert according to the allocation algorithm.

---

## Defects Detected By This Test

### Incorrect Expert Ranking

Questions are allocated to lower scoring experts.

### Preference Matching Failure

State, crop, or domain matching produces incorrect scores.

### Sorting Logic Failure

Experts are not ordered according to score.

### Queue Assignment Failure

Highest ranked expert is calculated correctly but does not receive the allocation.

### Regression In Allocation Logic

Changes to expert scoring or sorting alter allocation behavior unexpectedly.
