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

# Chemical CRUD E2E Summary

## Workflow Covered

1. Authenticate using Firebase ID token
2. Create Chemical
3. Retrieve Chemical by ID
4. Update Chemical
5. Verify Updated Data
6. Delete Chemical
7. Verify Deleted Chemical Returns 404

## Endpoints Validated

- POST /api/chemicals
- GET /api/chemicals/:chemicalId
- PUT /api/chemicals/:chemicalId
- DELETE /api/chemicals/:chemicalId

## Components Verified

- Firebase Authentication
- authorizationChecker
- currentUserChecker
- ChemicalController
- ChemicalService
- ChemicalRepository
- MongoDB Persistence Layer

## Test Result

PASS

## Coverage Achieved

- Create Operation
- Read Operation
- Update Operation
- Delete Operation
- Persistence Validation
- Deletion Validation

## Notes

Tests were executed against a live backend instance using a valid Firebase token and real application dependencies.

Database isolation should be confirmed before expanding the E2E suite further.
