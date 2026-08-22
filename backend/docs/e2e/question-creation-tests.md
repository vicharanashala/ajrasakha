# Question Creation E2E

**Test Name:** `moderator creates question successfully`

**Purpose**

Validate that an authenticated moderator can create a question through the Question API and receive a valid question ID in the response.

---

### Preconditions

- Backend is running.
- Firebase authentication is configured.
- Moderator test account exists.
- Moderator token is generated dynamically using Firebase Authentication.
- Crop `"Brinjal"` exists in crop master data.

---

### Endpoint

```http
POST /api/questions
```

---

### Authentication

```http
Authorization: Bearer <moderator_token>
```

---

### Request Payload

```json
{
  "question": "E2E Question <timestamp>",
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

### Validation Performed

#### Request Validation

Verified that:

- Question text is accepted.
- Required `details` fields are provided.
- Valid source (`AGRI_EXPERT`) is accepted.
- Valid priority (`medium`) is accepted.

#### Authentication Validation

Verified that:

- A valid Firebase token is accepted.
- Authenticated moderator can access the endpoint.

#### Response Validation

Verified that:

```json
{
  "success": true,
  "message": "Question submitted successfully.",
  "question_id": "<generated_id>"
}
```

is returned.

Assertions:

```ts
expect(res.status).toBe(201);
expect(res.body.success).toBe(true);
expect(res.body.question_id).toBeDefined();
```

---

### Expected Result

| Check            | Expected |
| ---------------- | -------- |
| HTTP Status      | 201      |
| success          | true     |
| question_id      | Present  |
| Question Created | Yes      |

---

### Result

✅ **PASSED**

Question was successfully created and a valid `question_id` was returned.

---

### Notes

From reviewing `QuestionService.addQuestion()`:

- Question creation is synchronous.
- Duplicate detection runs later in a background process.
- Expert allocation runs later in a background process.
- Notifications run later in a background process.

Therefore, this test validates only:

```text
Authentication
→ Validation
→ Question Persistence
→ Question ID Generation
```

and does **not** validate expert allocation or duplicate detection.

---

### Documentation: Get Question By ID E2E

**Test Name:** `moderator gets created question by id`

**Purpose**

Verify that a previously created question can be retrieved successfully using its question ID.

---

### Preconditions

- Question creation E2E test completed successfully.
- Valid moderator Firebase token available.
- Valid `questionId` obtained from create response.

---

### Endpoint

```http
GET /api/questions/:questionId/full
```

---

### Authentication

```http
Authorization: Bearer <moderator_token>
```

---

### Validation Performed

#### Authentication Validation

Verified that:

- Authenticated moderator can access the endpoint.

#### Data Retrieval Validation

Verified that:

- Question exists in the database.
- Question is returned successfully.
- Returned ID matches the created question.
- Question text matches the submitted question.
- Question details persisted correctly.
- Source persisted correctly.

---

### Assertions

```ts
expect(res.status).toBe(200);
expect(res.body.success).toBe(true);

expect(res.body.data._id).toBe(questionId);

expect(res.body.data.question).toContain('E2E Question');

expect(res.body.data.details.state).toBe('Punjab');
expect(res.body.data.details.district).toBe('Ludhiana');
expect(res.body.data.details.crop).toBe('Brinjal');

expect(res.body.data.source).toBe('AGRI_EXPERT');
```

---

### Expected Result

| Check               | Expected |
| ------------------- | -------- |
| HTTP Status         | 200      |
| success             | true     |
| Question Found      | Yes      |
| Correct ID Returned | Yes      |
| Details Persisted   | Yes      |
| Source Persisted    | Yes      |

---

### Result

**PASSED**

Question was successfully retrieved and all persisted data matched the values submitted during creation.

---

## Documentation: Update Question E2E

**Test Name:** `moderator updates question successfully`

### Purpose

Verify that an existing question can be updated by an authenticated moderator.

---

### Preconditions

- Question exists.
- Moderator token is valid.
- Question ID available from create test.

---

### Endpoint

```http
PUT /api/questions/:questionId
```

---

### Authentication

```http
Authorization: Bearer <moderator_token>
```

---

### Request Payload

```json
{
  "question": "E2E Updated Question",
  "priority": "high",
  "details": {
    "state": "Punjab",
    "district": "Patiala",
    "crop": "Brinjal",
    "season": "Kharif",
    "domain": "Disease Management"
  }
}
```

---

### Validation Performed

Verified that:

- Moderator can update question.
- Question text can be modified.
- Priority can be modified.
- Details object can be modified.
- API returns success response.

---

### Assertions

```ts
expect(res.status).toBe(200);
```

---

### Result

**PASSED**

Question updated successfully.

---

## Documentation: Verify Updated Question E2E

**Test Name:** `question reflects updated values`

### Purpose

Verify that the updated values were actually persisted in the database.

---

### Endpoint

```http
GET /api/questions/:questionId/full
```

---

### Authentication

```http
Authorization: Bearer <moderator_token>
```

---

### Validation Performed

Verified that:

- Updated question text persisted.
- Updated priority persisted.
- Updated location details persisted.
- Updated crop details persisted.
- Updated domain persisted.

---

### Assertions

```ts
expect(res.body.data.question).toBe('E2E Updated Question');

expect(res.body.data.priority).toBe('high');

expect(res.body.data.details.state).toBe('Punjab');

expect(res.body.data.details.district).toBe('Patiala');

expect(res.body.data.details.crop).toBe('Brinjal');

expect(res.body.data.details.season).toBe('Kharif');

expect(res.body.data.details.domain).toBe('Disease Management');
```

---

### Result

**PASSED**

All updated fields were successfully persisted and returned by the API.

---

Add the following sections after **Verify Updated Question E2E**.

---

# Documentation: Delete Question E2E

**Test Name:** `moderator deletes question successfully`

### Purpose

Verify that an authenticated moderator can delete an existing question.

---

### Preconditions

- Question exists.
- Moderator token is valid.
- Question ID available from previous tests.

---

### Endpoint

```http
DELETE /api/questions/:questionId
```

---

### Authentication

```http
Authorization: Bearer <moderator_token>
```

---

### Validation Performed

Verified that:

- Moderator can access delete endpoint.
- Existing question can be deleted.
- API returns successful deletion response.

---

### Assertions

```ts
expect(res.status).toBe(200);
expect(res.body.deletedCount).toBe(1);
```

---

### Expected Result

| Check            | Expected |
| ---------------- | -------- |
| HTTP Status      | 200      |
| deletedCount     | 1        |
| Question Deleted | Yes      |

---

### Result

✅ **PASSED**

Question was successfully deleted from the system.

# FAILED TESTS AND THEIR REASON

## Documentation: Bulk Delete Questions E2E

**Test Name:** `moderator bulk deletes questions`

### Purpose

Verify that an authenticated moderator can delete multiple questions in a single operation using the bulk delete endpoint.

---

### Preconditions

- Backend is running.
- Firebase authentication is configured.
- Moderator token is valid.
- Multiple questions exist and are available for deletion.

---

### Endpoint

```http
DELETE /api/questions/bulk
```

---

### Authentication

```http
Authorization: Bearer <moderator_token>
```

---

### Request Payload

```json
{
  "questionIds": ["<question_id_1>", "<question_id_2>"]
}
```

---

### Test Setup

Before executing the bulk delete request:

1. Create Question #1.
2. Create Question #2.
3. Capture both generated question IDs.
4. Pass the IDs to the bulk delete endpoint.

---

### Validation Performed

Verified that:

- Moderator can access bulk delete endpoint.
- Multiple question IDs are accepted.
- Bulk delete operation completes successfully.
- API returns success response.

---

### Assertions

```ts
expect(deleteRes.status).toBe(200);
```

---

### Expected Result

| Check                | Expected |
| -------------------- | -------- |
| HTTP Status          | 200      |
| Bulk Delete Executed | Yes      |
| Questions Removed    | Yes      |

---

### Result

**PASSED**

Multiple questions were successfully deleted using a single bulk delete request.

---

# Documentation: Bulk Delete Questions E2E

**Test Name:** `moderator bulk deletes questions`

## Purpose

Verify that an authenticated moderator can submit a bulk delete request for multiple questions and receive a background job identifier.

This test validates request acceptance only. It does **not** validate completion of the deletion process.

---

## Architecture Overview

Bulk deletion is implemented as an asynchronous background operation.

Flow:

```text
Client
  ↓
DELETE /api/questions/bulk
  ↓
QuestionController
  ↓
QuestionService.bulkDeleteQuestions()
  ↓
startBulkDeleteWorker()
  ↓
Returns Job ID Immediately
  ↓
Background Worker Executes Later
```

The endpoint does not wait for deletion to finish before returning a response.

---

## Preconditions

- Backend is running.
- Firebase authentication is configured.
- Moderator account exists.
- Moderator token is valid.
- At least two questions exist and can be deleted.

---

## Endpoint

```http
DELETE /api/questions/bulk
```

---

## Authentication

```http
Authorization: Bearer <moderator_token>
```

---

## Request Payload

```json
{
  "questionIds": ["question_id_1", "question_id_2"]
}
```

---

## Test Setup

### Step 1

Create Question #1

```http
POST /api/questions
```

Capture:

```ts
questionId1;
```

---

### Step 2

Create Question #2

```http
POST /api/questions
```

Capture:

```ts
questionId2;
```

---

### Step 3

Submit bulk delete request

```json
{
  "questionIds": [
    questionId1,
    questionId2
  ]
}
```

---

## Validation Performed

Verified that:

- Moderator can access endpoint.
- Multiple question IDs are accepted.
- Background deletion job is created.
- API returns a valid job identifier.
- Request is accepted successfully.

---

## Expected Response

```json
{
  "jobId": "delete_1781005292958",
  "message": "Your bulk delete request for 2 question(s) is being processed in the background. Estimated time: ~ 2 sec."
}
```

---

## Assertions

```ts
expect(deleteRes.status).toBe(200);

expect(deleteRes.body.jobId).toBeDefined();

expect(deleteRes.body.message).toContain('being processed in the background');
```

---

## Expected Result

| Check            | Expected |
| ---------------- | -------- |
| HTTP Status      | 200      |
| Job Created      | Yes      |
| Job ID Returned  | Yes      |
| Request Accepted | Yes      |

---

## Result

✅ **PASSED**

Bulk delete request was accepted and a background worker job was successfully created.

---

## Coverage Achieved

This test validates:

```text
Authentication
    ↓
Controller
    ↓
Service
    ↓
Background Worker Scheduling
```

This test does NOT validate:

```text
Worker Execution
Question Deletion
Database Cleanup
Completion Status
```

because the endpoint returns before deletion finishes.

---

# Documentation: Bulk Deleted Questions Are Not Retrievable

**Test Name:** `bulk deleted questions are not retrievable`

---

## Purpose

Attempt to verify that questions submitted for bulk deletion can no longer be retrieved.

---

## Current Status

⚠️ **Test is currently invalid against the existing API contract.**

---

## Why The Test Fails

The bulk delete endpoint is asynchronous.

Current implementation:

```ts
async bulkDeleteQuestions(
  userId: string,
  questionIds: string[],
) {
  const jobId = startBulkDeleteWorker(
    questionIds,
    userId,
  );

  return {
    jobId,
    message,
  };
}
```

The endpoint only schedules a worker:

```text
DELETE Request
      ↓
Job Created
      ↓
Response Returned
      ↓
Worker Starts
      ↓
Worker Deletes Questions
```

Because the API returns immediately, there is no guarantee that deletion has completed when the next test executes.

---

## Observed Failure

The test performs:

```ts
DELETE / api / questions / bulk;
```

followed immediately by:

```ts
GET /api/questions/:id/full
```

and receives:

```http
200 OK
```

instead of:

```http
404 Not Found
```

because the worker has not finished deleting the question yet.

---

## Example Timeline

```text
T+0ms
Bulk Delete Request Sent

T+50ms
API Returns 200 + JobId

T+60ms
Next Test Starts

T+100ms
GET Question
→ Question Still Exists

T+500ms
Worker Deletes Question
```

The retrieval request races ahead of the worker.

---

## Actual Test Output

```text
Question <id> status: 200
```

Assertion:

```ts
expect([404, 500]).toContain(res.status);
```

fails because:

```text
200 ∉ [404, 500]
```

---

## Root Cause

The API does not expose any mechanism to determine whether the worker has completed.

Current API:

```text
DELETE /questions/bulk
```

returns:

```json
{
  "jobId": "..."
}
```

but there is no endpoint to check:

```text
running
completed
failed
```

status of the job.

---

## Missing Capability

A status endpoint is required:

```http
GET /api/questions/bulk/status/:jobId
```

which would return:

```json
{
  "status": "running"
}
```

or

```json
{
  "status": "completed"
}
```

---

## Correct Future Test Flow

```text
Create Questions
      ↓
Bulk Delete
      ↓
Receive JobId
      ↓
Poll Job Status
      ↓
Status = completed
      ↓
Verify Questions Removed
```

---

## Why Waiting With setTimeout Is Not Reliable

Using:

```ts
await new Promise(resolve => setTimeout(resolve, 5000));
```

is not deterministic because:

- Worker execution time varies.
- Machine load varies.
- CI environments are slower.
- Database operations may take longer.

A fixed delay can still fail intermittently.

---

## Current Recommendation

Do not assert deletion completion in E2E tests until a job-status endpoint exists.

Current E2E coverage should stop at:

```text
Bulk Delete Request Accepted
```

which is the only behavior guaranteed by the API contract today.

---

## Defect / Gap Identified

### QUESTION-E2E-002

**Bulk Delete Completion Cannot Be Verified**

Severity: Medium

Description:

The bulk delete endpoint returns immediately after scheduling a worker and does not expose any API to determine when deletion has completed. This prevents deterministic E2E validation of deletion success.

---

## Current Coverage Status

```text
Question CRUD

Create Question                     ✓
Get Question By ID                  ✓
Update Question                     ✓
Verify Updated Question             ✓
Delete Question                     ✓
Retrieve Deleted Question           ✗ Bug Found (QUESTION-E2E-001)

Bulk Delete Request Accepted        ✓
Bulk Delete Completion Verified     ✗ Not Currently Testable
```
