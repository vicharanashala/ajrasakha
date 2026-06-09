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

---

# Documentation: Retrieve Deleted Question E2E

**Test Name:** `deleted question is no longer retrievable`

### Purpose

Verify that a deleted question cannot be retrieved using the Question Details endpoint.

---

### Preconditions

- Question has been successfully deleted.
- Valid moderator token available.
- Deleted question ID available.

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

### Expected Behavior

The API should return:

```http
404 Not Found
```

indicating that the requested question no longer exists.

---

### Actual Behavior

The API returned:

```http
500 Internal Server Error
```

Response:

```json
{
  "name": "TypeError",
  "message": "Cannot destructure property 'question' of '(intermediate value)' as it is null."
}
```

---

### Root Cause Analysis

The controller assumes that a question is always returned from:

```ts
this.questionService.getQuestionFullData(questionId, userId);
```

Current implementation:

```ts
const {question, approved_moderator} =
  await this.questionService.getQuestionFullData(questionId, userId);
```

When the question has been deleted, the service returns:

```ts
null;
```

which results in:

```ts
const {question, approved_moderator} = null;
```

causing a runtime exception and a 500 response.

---

### Expected Fix

Controller should validate the service response before destructuring:

```ts
const result = await this.questionService.getQuestionFullData(
  questionId,
  userId,
);

if (!result) {
  throw new NotFoundError(`Question with id ${questionId} not found`);
}

const {question, approved_moderator} = result;
```

---

### Expected Result

| Check                      | Expected           |
| -------------------------- | ------------------ |
| HTTP Status                | 404                |
| Error Message              | Question not found |
| Internal Exception Exposed | No                 |

---

### Actual Result

| Check                      | Actual    |
| -------------------------- | --------- |
| HTTP Status                | 500       |
| Error Message              | TypeError |
| Internal Exception Exposed | Yes       |

---

### Status

❌ **FAILED**

---

### Severity

**Medium**

The delete operation succeeds, but retrieval of a deleted resource returns an incorrect status code and exposes an internal implementation error.

---

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
