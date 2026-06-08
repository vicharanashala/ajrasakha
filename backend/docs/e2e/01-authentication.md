# Authentication E2E

## Objective

Verify that a valid Firebase authentication token can access protected backend endpoints.

## Endpoint Tested

GET /api/chemicals

## Authentication Method

Authorization Header

```http
Authorization: Bearer <firebase-id-token>
```

## Test Procedure

1. Start backend application.
2. Obtain Firebase ID token from authenticated frontend session.
3. Store token in `.env.test` as `ADMIN_TOKEN`.
4. Execute E2E test using Vitest and Supertest.
5. Send request to `/api/chemicals`.

## Expected Result

Authenticated request succeeds.

## Actual Result

Status Code: 200

Response:

- chemicals array returned
- totalCount returned
- totalPages returned

## Verified Components

- Firebase token validation
- authorizationChecker
- currentUserChecker
- Controller execution
- Service execution
- Repository execution
- MongoDB connectivity

## Conclusion

Authenticated E2E requests are working successfully and can be used as the foundation for future backend E2E workflows.
