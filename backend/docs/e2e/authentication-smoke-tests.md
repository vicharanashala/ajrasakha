# Authentication Smoke Tests – E2E Documentation

## Overview

These tests validate the authentication and authorization layer used by protected backend endpoints.

Authentication is performed using Firebase ID Tokens. The backend validates incoming tokens through Firebase Admin SDK before allowing access to protected routes.

Test Endpoint:

```http
GET /api/chemicals
```

This endpoint was selected because it is protected with:

```ts
@Authorized()
```

and therefore exercises the complete authentication flow.

---

## AUTH-E2E-001 — Missing Authentication Token

### Objective

Verify that requests without an Authorization header are rejected.

### Request

```http
GET /api/chemicals
```

### Expected Result

```http
401 Unauthorized
```

### Actual Result

```http
401 Unauthorized
```

### Response

```json
{
  "name": "AuthorizationRequiredError",
  "message": "Authorization is required for request on GET /api/chemicals"
}
```

### Status

PASS

### Notes

The authentication middleware correctly rejects requests that do not contain a bearer token.

---

## AUTH-E2E-002 — Invalid Authentication Token

### Objective

Verify that malformed or invalid Firebase tokens are rejected.

### Request

```http
GET /api/chemicals
Authorization: Bearer invalid-token
```

### Expected Result

```http
401 Unauthorized
```

### Actual Result

```http
500 Internal Server Error
```

### Response

```json
{
  "code": "auth/argument-error",
  "message": "Decoding Firebase ID token failed..."
}
```

### Status

FAILED

### Root Cause Analysis

The invalid token reaches Firebase token verification.

Firebase throws:

```text
auth/argument-error
```

The exception propagates through the authentication layer and is returned as a server error.

Current implementation does not convert Firebase token verification failures into:

```http
401 Unauthorized
```

responses.

### Recommended Fix

Handle Firebase token verification exceptions inside:

```ts
authorizationChecker();
```

and return:

```http
401 Unauthorized
```

instead of allowing the exception to surface as a 500 response.

### Defect Classification

Authentication Error Handling

Priority: Medium

Impact: Invalid client credentials are reported as server failures.

---

## AUTH-E2E-003 — Valid Authentication Token

### Objective

Verify that a valid Firebase token can access a protected endpoint.

### Test User

Admin User

### Request

```http
GET /api/chemicals
Authorization: Bearer <valid-admin-token>
```

### Expected Result

```http
200 OK
```

### Actual Result

```http
200 OK
```

### Response

Endpoint returned the chemical list successfully.

### Status

PASS

### Notes

This validates:

- Firebase token verification
- Authorization middleware
- Current user resolution
- Protected route access

---

## Summary

| Test ID      | Scenario          | Expected | Actual | Status |
| ------------ | ----------------- | -------- | ------ | ------ |
| AUTH-E2E-001 | Missing Token     | 401      | 401    | PASS   |
| AUTH-E2E-002 | Invalid Token     | 401      | 500    | FAILED |
| AUTH-E2E-003 | Valid Admin Token | 200      | 200    | PASS   |

### Coverage Achieved

- Missing token handling
- Firebase token validation
- Protected route access
- Authorization middleware execution
- Current user resolution

### Open Defects

- Invalid Firebase token returns HTTP 500 instead of HTTP 401.
