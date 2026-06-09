# Chemical CRUD E2E

## Overview

This E2E suite validates the complete request flow for the Chemical module using a real backend instance, real Firebase authentication, and the application's actual service and repository layers.

### Verified Flow

Client Request
→ Firebase Authentication
→ authorizationChecker
→ currentUserChecker
→ ChemicalController
→ ChemicalService
→ ChemicalRepository
→ MongoDB

---

## Authentication

### Authentication Method

Firebase ID Token

### Header

Authorization: Bearer <firebase-id-token>

### Verification

Successfully accessed protected endpoints using a real Firebase token obtained from a valid user session.

---

# Test Case 1: Create Chemical

## Objective

Verify that an authenticated admin user can create a chemical.

## Endpoint

POST /api/chemicals

## Request Payload

```json
{
  "name": "E2E_Chemical_<timestamp>",
  "status": "Restricted"
}
```

## Expected Result

- HTTP 201
- success = true
- chemical record created

## Actual Result

PASS

## Verified Components

- Authentication
- Authorization
- Request validation
- ChemicalController.createChemical()
- ChemicalService.createChemical()
- ChemicalRepository.createChemical()
- MongoDB persistence

---

# Test Case 2: Get Chemical By ID

## Objective

Verify that a created chemical can be retrieved using its identifier.

## Endpoint

GET /api/chemicals/:chemicalId

## Test Flow

1. Create chemical
2. Capture returned \_id
3. Request chemical using returned id

## Expected Result

- HTTP 200
- success = true
- returned id matches created id

## Actual Result

PASS

## Verified Components

- Route parameter validation
- ChemicalController.getChemicalById()
- ChemicalService.getChemicalById()
- ChemicalRepository.getChemicalById()
- MongoDB retrieval

---

# Test Case 3: Update Chemical

## Objective

Verify that an existing chemical can be updated.

## Endpoint

PUT /api/chemicals/:chemicalId

## Request Payload

```json
{
  "name": "<original_name>_UPDATED",
  "status": "Banned"
}
```

## Expected Result

- HTTP 200
- success = true
- name updated
- status updated

## Actual Result

PASS

## Verified Components

- Authentication
- Authorization
- ChemicalController.updateChemical()
- ChemicalService.updateChemical()
- ChemicalRepository.updateChemical()
- MongoDB update operation

---

# Test Case 4: Read After Update Verification

## Objective

Verify that updates are actually persisted in MongoDB and not merely returned in the update response.

## Endpoint

GET /api/chemicals/:chemicalId

## Test Flow

1. Create chemical
2. Update chemical name and status
3. Retrieve the same chemical again using its id

## Expected Result

- HTTP 200
- success = true
- updated name returned
- updated status returned

## Verification Performed

Validated that the retrieved chemical contained:

- name ending with `_UPDATED`
- status equal to `Banned`

## Actual Result

PASS

## Verified Components

- ChemicalController.getChemicalById()
- ChemicalService.getChemicalById()
- ChemicalRepository.getChemicalById()
- MongoDB persistence layer

# Test Case 5: Delete Chemical

## Objective

Verify that an existing chemical can be deleted successfully.

## Endpoint

DELETE /api/chemicals/:chemicalId

## Test Flow

1. Create chemical
2. Capture chemical id
3. Delete chemical using the captured id

## Expected Result

- HTTP 200
- success = true
- chemical removed from the system

## Actual Result

PASS

## Verified Components

- Authentication
- Authorization
- ChemicalController.deleteChemical()
- ChemicalService.deleteChemical()
- ChemicalRepository.deleteChemical()
- MongoDB delete operation

---

# Test Case 6: Verify Deleted Chemical Returns 404

## Objective

Verify that a deleted chemical can no longer be retrieved.

## Endpoint

GET /api/chemicals/:chemicalId

## Test Flow

1. Create chemical
2. Update chemical
3. Delete chemical
4. Attempt to retrieve deleted chemical

## Expected Result

- HTTP 404
- Chemical not found

## Actual Result

PASS

## Verified Components

- ChemicalController.getChemicalById()
- ChemicalService.getChemicalById()
- ChemicalRepository.getChemicalById()
- MongoDB record removal validation

---

# Test Case 7: Expert User Cannot Create Chemical

## Objective

Verify that users with the `expert` role cannot create chemicals.

## Endpoint

POST /api/chemicals

## Authentication

Expert user Firebase token

## Request Payload

```json
{
  "name": "E2E_Expert_<timestamp>",
  "status": "Restricted"
}
```

## Expected Result

- HTTP 403 Forbidden
- Chemical is not created

## Actual Result

PASS

## Verified Components

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- Role-based authorization
- ChemicalController.createChemical()

## Business Rule Verified

Only users with the following roles may create chemicals:

- admin
- moderator

Users with the following role are forbidden:

- expert

## Conclusion

Backend authorization correctly prevents expert users from creating chemicals even when they directly invoke the API.

---

# Test Case 8: Moderator User Can Create Chemical

## Objective

Verify that users with the `moderator` role can create chemicals.

## Endpoint

POST /api/chemicals

## Authentication

Moderator user Firebase token

## Request Payload

```json
{
  "name": "E2E_Create_Chemical_Moderator_${Date.now()}",
  "status": "Restricted"
}
```

## Expected Result

- HTTP 201 Created
- success = true
- Chemical created successfully

## Actual Result

PASS

## Verified Components

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- Role-based authorization
- ChemicalController.createChemical()
- ChemicalService.createChemical()
- ChemicalRepository.createChemical()

## Business Rule Verified

Users with the `moderator` role are authorized to create chemicals.

---

# Test Case 9: Expert User Cannot Update Chemical

## Objective

Verify that users with the `expert` role cannot update chemicals.

## Endpoint

PUT /api/chemicals/:chemicalId

## Authentication

Expert user Firebase token

## Test Flow

1. Create chemical using authorized user
2. Attempt to update chemical using expert user
3. Verify request is rejected

## Request Payload

```json
{
  "name": "Updated_By_Expert",
  "status": "Banned"
}
```

## Expected Result

- HTTP 403 Forbidden
- Chemical is not modified

## Actual Result

PASS

## Verified Components

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- Role-based authorization
- ChemicalController.updateChemical()

## Business Rule Verified

Users with the `expert` role are not authorized to update chemicals.

---

# Test Case 10: Moderator User Can Update Chemical

## Objective

Verify that users with the `moderator` role can update existing chemicals.

## Endpoint

PUT /api/chemicals/:chemicalId

## Authentication

Moderator user Firebase token

## Test Flow

1. Create chemical using admin user
2. Update chemical using moderator user
3. Retrieve chemical after update
4. Verify updated values were persisted

## Request Payload

```json
{
  "name": "Updated_By_Moderator",
  "status": "Banned"
}
```

## Expected Result

- HTTP 200 OK
- success = true
- Chemical updated successfully
- Updated values persisted in database

## Actual Result

PASS

## Verification Performed

Verified that:

- Update request succeeded
- Chemical name changed to `Updated_By_Moderator`
- Chemical status changed to `Banned`
- Subsequent GET request returned updated values

## Verified Components

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- Role-based authorization
- ChemicalController.updateChemical()
- ChemicalService.updateChemical()
- ChemicalRepository.updateChemical()
- MongoDB update persistence

## Business Rule Verified

Users with the `moderator` role are authorized to update chemicals.

---

# Test Case 11: Expert User Cannot Delete Chemical

## Objective

Verify that users with the `expert` role cannot delete chemicals.

## Endpoint

DELETE /api/chemicals/:chemicalId

## Authentication

Expert user Firebase token

## Test Flow

1. Create chemical using admin user
2. Attempt to delete chemical using expert user
3. Verify request is rejected
4. Verify chemical still exists

## Expected Result

- HTTP 403 Forbidden
- Chemical remains unchanged
- Chemical remains retrievable

## Actual Result

PASS

## Verification Performed

Verified that:

- Delete request returned HTTP 403
- Chemical record still existed after failed delete attempt
- Chemical remained retrievable through GET endpoint

## Verified Components

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- Role-based authorization
- ChemicalController.deleteChemical()

## Business Rule Verified

Users with the `expert` role are not authorized to delete chemicals.

---

# Test Case 12: Moderator User Can Delete Chemical

## Objective

Verify that users with the `moderator` role can delete chemicals.

## Endpoint

DELETE /api/chemicals/:chemicalId

## Authentication

Moderator user Firebase token

## Test Flow

1. Create chemical using admin user
2. Delete chemical using moderator user
3. Verify delete operation succeeds
4. Verify chemical no longer exists

## Expected Result

- HTTP 200 OK
- success = true
- Chemical deleted successfully
- Subsequent retrieval returns HTTP 404

## Actual Result

PASS

## Verification Performed

Verified that:

- Delete request succeeded
- Chemical was removed from the database
- Subsequent GET request returned HTTP 404

## Verified Components

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- Role-based authorization
- ChemicalController.deleteChemical()
- ChemicalService.deleteChemical()
- ChemicalRepository.deleteChemical()
- MongoDB delete persistence

## Business Rule Verified

Users with the `moderator` role are authorized to delete chemicals.

# Chemical Module E2E Summary

## CRUD Coverage

| Scenario                            | Status |
| ----------------------------------- | ------ |
| Create Chemical                     | PASS   |
| Get Chemical By ID                  | PASS   |
| Update Chemical                     | PASS   |
| Verify Updated Data                 | PASS   |
| Delete Chemical                     | PASS   |
| Verify Deleted Chemical Returns 404 | PASS   |

## Authorization Coverage

### Create

| Role      | Status     |
| --------- | ---------- |
| Admin     | PASS       |
| Moderator | PASS       |
| Expert    | PASS (403) |

### Update

| Role      | Status     |
| --------- | ---------- |
| Admin     | PASS       |
| Moderator | PASS       |
| Expert    | PASS (403) |

### Delete

| Role      | Status     |
| --------- | ---------- |
| Admin     | PASS       |
| Moderator | PASS       |
| Expert    | PASS (403) |

## Components Verified

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- ChemicalController
- ChemicalService
- ChemicalRepository
- MongoDB Persistence Layer

## Overall Result

PASS

## Coverage Achieved

- CRUD Operations
- Persistence Validation
- Authorization Validation
- Role-Based Access Control
- Error Handling (404)
- Resource Lifecycle Validation

The Chemical module has comprehensive backend E2E coverage for its primary business workflows.
