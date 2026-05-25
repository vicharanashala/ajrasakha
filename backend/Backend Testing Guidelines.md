# Backend Testing Guidelines

## Why We Are Adding Tests

We are starting to standardize backend testing so that:

- new features do not break existing functionality
- debugging becomes easier
- future refactors are safer
- features can be verified quickly before merge

The goal is simple:

> Every new backend feature should include at least one basic test.

---

# Test Types

We currently support 3 types of tests.

| Type | Purpose | File Name |

|---|---|---|

| Unit Test | Test service/business logic |`*.unit.test.ts`|

| Integration Test | Test database/repository logic |`*.integration.test.ts`|

| API Test | Test API endpoints/controllers |`*.api.test.ts`|

---

# Where To Add Tests

Place test files inside the module's `tests` folder.

Example:

```text

src/modules/question/tests/

```

Examples:

```text

src/modules/question/tests/QuestionService.unit.test.ts

src/modules/crop/tests/CropRepository.integration.test.ts

src/modules/auth/tests/Auth.api.test.ts

```

---

# Minimum Requirement

Every new feature should include:

- at least ONE passing test
- preferably one happy-path scenario

Examples:

- service returns correct data
- repository inserts into DB
- endpoint returns 200
- validation throws expected error

---

# Unit Test Example

Use unit tests for:

- services
- helpers
- utilities
- business logic

Example:

```ts
import {describe, it, expect, vi} from 'vitest';

describe('QuestionService', () => {
  it('creates question successfully', async () => {
    const mockRepo = {
      create: vi.fn().mockResolvedValue({
        id: '1',

        title: 'Test Question',
      }),
    };

    expect(mockRepo.create).toBeDefined();
  });
});
```

File naming:

```text

QuestionService.unit.test.ts

```

---

# Integration Test Example

Use integration tests for:

- repositories
- MongoDB queries
- DB operations

Example:

```ts
import {describe, it, expect} from 'vitest';

describe('CropRepository integration', () => {
  it('creates crop in database', async () => {
    expect(true).toBe(true);
  });
});
```

File naming:

```text

CropRepository.integration.test.ts

```

---

# API Test Example

Use API tests for:

- endpoints
- request/response validation
- authentication flows

Example:

```ts
import request from 'supertest';

describe('Question API', () => {
  it('GET /questions returns 200', async () => {
    expect(true).toBe(true);
  });
});
```

File naming:

```text

Question.api.test.ts

```

---

# Running Tests

## Run all tests

```bash

pnpm test

```

---

## Run a single test file

```bash

pnpm vitest run src/modules/question/tests/QuestionService.unit.test.ts

```

---

# Important Rules

## DO

- keep tests small
- test only one feature at a time
- use mocks where possible
- use `.env.test`
- keep tests independent

---

## DON'T

- use production database
- call production APIs
- depend on cron jobs/workers
- initialize unnecessary infrastructure
- hardcode secrets

---

# Current Recommendation

For now, prefer writing:

1. Unit tests
2. Repository integration tests

Avoid complex controller/API tests unless necessary.

---

# Quick Checklist Before Merge

Before creating PR:

- [ ] test file added
- [ ] tests pass locally
- [ ] no production DB used
- [ ] feature happy-path tested

---

# Need Help?

If unsure:

- copy an existing test from another module
- keep the test minimal
- ask for review/help

Simple tests are better than no tests.
