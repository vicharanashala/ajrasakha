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

| Type             | Purpose                        | File Name               |
| ---------------- | ------------------------------ | ----------------------- |
| Unit Test        | Test service/business logic    | `*.unit.test.ts`        |
| Integration Test | Test database/repository logic | `*.integration.test.ts` |
| API Test         | Test API endpoints/controllers | `*.api.test.ts`         |

---

# Where To Add Tests

Place test files inside the module's `tests` folder.

Example:

```text

src/modules/context/tests/

```

Examples:

```text

backend/src/modules/context/tests/ContextController.api.test.ts
=> FOR: backend/src/modules/context/controllers/ContextController.ts

backend/src/modules/context/tests/ContextService.unit.test.ts
=> FOR: backend/src/modules/context/services/ContextService.ts

backend/src/modules/context/tests/ContextRepository.integration.test.ts
=> FOR: backend/src/shared/database/providers/mongo/repositories/ContextRepository.ts


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

# API Test Example

Use API tests for:

- endpoints
- request/response validation
- authentication flows

Example:
=>`backend/src/modules/context/tests/ContextController.api.test.ts`
=> FOR: `backend/src/modules/context/controllers/ContextController.ts`

```ts
import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import {useExpressServer, useContainer} from 'routing-controllers';
import {Container} from 'inversify';
import {describe, it, expect, beforeAll, beforeEach, vi} from 'vitest';

import {InversifyAdapter} from '#root/inversify-adapter.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {HttpErrorHandler} from '#shared/index.js';

import {ContextController} from '../controllers/ContextController.js';

const mockUser = {
  _id: '664f000000000000000000001',
  role: 'admin',
  firebaseUID: 'firebase-admin-uid',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  status: 'active',
  isBlocked: false,
};

const mockContextService = {
  addContext: vi.fn(),
  translate: vi.fn(),
};

describe('ContextController', () => {
  let app: any;

  beforeAll(() => {
    const container = new Container();

    container.bind(ContextController).toSelf().inSingletonScope();

    container
      .bind(GLOBAL_TYPES.ContextService)
      .toConstantValue(mockContextService);

    container.bind(HttpErrorHandler).toSelf().inSingletonScope();

    useContainer(new InversifyAdapter(container));

    app = useExpressServer(Express(), {
      controllers: [ContextController],
      middlewares: [HttpErrorHandler],
      defaultErrorHandler: false,
      validation: true,

      authorizationChecker: async () => true,

      currentUserChecker: async () => mockUser,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /context', () => {
    it('creates context successfully', async () => {
      mockContextService.addContext.mockResolvedValueOnce({
        insertedId: 'context-123',
      });

      const res = await request(app).post('/context').send({
        transcript: 'This is a transcript',
      });

      expect(res.status).toBe(201);

      expect(res.body).toEqual({
        insertedId: 'context-123',
      });

      expect(mockContextService.addContext).toHaveBeenCalledWith(
        mockUser._id,
        'This is a transcript',
      );
    });

    it('returns 500 when service throws', async () => {
      mockContextService.addContext.mockRejectedValueOnce(
        new Error('Failed to create context'),
      );

      const res = await request(app).post('/context').send({
        transcript: 'test transcript',
      });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /context/translate', () => {
    it('translates successfully', async () => {
      mockContextService.translate.mockResolvedValueOnce({
        translated_text: 'नमस्ते',
      });

      const res = await request(app).post('/context/translate').send({
        text: 'Hello',
        targetLang: 'hi-IN',
      });

      expect(res.status).toBe(200);

      expect(res.body).toEqual({
        translated_text: 'नमस्ते',
      });

      expect(mockContextService.translate).toHaveBeenCalledWith(
        'Hello',
        'hi-IN',
        undefined,
      );
    });

    it('passes sourceLang when provided', async () => {
      mockContextService.translate.mockResolvedValueOnce({
        translated_text: 'नमस्ते',
      });

      await request(app).post('/context/translate').send({
        text: 'Hello',
        targetLang: 'hi-IN',
        sourceLang: 'en-IN',
      });

      expect(mockContextService.translate).toHaveBeenCalledWith(
        'Hello',
        'hi-IN',
        'en-IN',
      );
    });

    it('returns 500 when translation service throws', async () => {
      mockContextService.translate.mockRejectedValueOnce(
        new Error('Translation failed'),
      );

      const res = await request(app).post('/context/translate').send({
        text: 'Hello',
        targetLang: 'hi-IN',
      });

      expect(res.status).toBe(500);
    });
  });
});
```

File naming:

```text

Question.api.test.ts

```

---

# Unit Test Example

Use unit tests for:

- services
- helpers
- utilities
- business logic

Example:
=>`backend/src/modules/context/tests/ContextService.unit.test.ts`
=> FOR: `backend/src/modules/context/services/ContextService.ts`

backend/src/modules/context/tests/ContextRepository.integration.test.ts
=> FOR: backend/src/shared/database/providers/mongo/repositories/ContextRepository.ts

```ts
import 'reflect-metadata';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {BadRequestError, InternalServerError} from 'routing-controllers';

import {ContextService} from '../services/ContextService.js';
import {appConfig} from '#root/config/app.js';

describe('ContextService', () => {
  let service: ContextService;

  const mockContextRepo = {
    addContext: vi.fn(),
    getById: vi.fn(),
  };

  const mockQuestionService = {};
  const mockDatabase = {};

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ContextService(
      mockContextRepo as any,
      mockQuestionService as any,
      mockDatabase as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );

    appConfig.sarvamAPI = 'fake-api-key';
  });

  describe('addContext', () => {
    it('creates context successfully', async () => {
      mockContextRepo.addContext.mockResolvedValueOnce({
        insertedId: 'context-123',
      });

      const result = await service.addContext('user-1', 'sample transcript');

      expect(result).toEqual({
        insertedId: 'context-123',
      });

      expect(mockContextRepo.addContext).toHaveBeenCalled();
    });

    it('throws when transcript is empty', async () => {
      await expect(service.addContext('user-1', '')).rejects.toThrow(
        InternalServerError,
      );
    });

    it('throws when transcript is whitespace', async () => {
      await expect(service.addContext('user-1', '   ')).rejects.toThrow(
        InternalServerError,
      );
    });
  });

  describe('getById', () => {
    it('returns context successfully', async () => {
      const context = {
        _id: 'context-1',
        text: 'sample',
      };

      mockContextRepo.getById.mockResolvedValueOnce(context);

      const result = await service.getById('context-1');

      expect(result).toEqual(context);
    });

    it('throws when contextId is missing', async () => {
      await expect(service.getById('')).rejects.toThrow(InternalServerError);
    });

    it('throws when context not found', async () => {
      mockContextRepo.getById.mockResolvedValueOnce(null);

      await expect(service.getById('missing-id')).rejects.toThrow(
        BadRequestError,
      );
    });
  });

  describe('translate', () => {
    beforeEach(() => {
      appConfig.sarvamAPI = 'fake-api-key';

      vi.spyOn(service as any, '_callSarvamTranslate').mockResolvedValue(
        'translated',
      );
    });

    it('throws when api key is missing', async () => {
      appConfig.sarvamAPI = '';

      await expect(service.translate('hello', 'hi-IN')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws when text is missing', async () => {
      await expect(service.translate('', 'hi-IN')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws when targetLang is missing', async () => {
      await expect(service.translate('hello', '')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws when text exceeds max length', async () => {
      const text = 'a'.repeat(30001);

      await expect(service.translate(text, 'hi-IN')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('uses mayura directly for non-sarvam languages', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'fr-FR');

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'auto',
        'fr-FR',
        'mayura:v1',
        expect.any(String),
      );
    });

    it('uses two-step translation for sarvam language without sourceLang', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'hi-IN');

      expect(spy).toHaveBeenNthCalledWith(
        1,
        'Hello world',
        'auto',
        'en-IN',
        'mayura:v1',
        expect.any(String),
      );

      expect(spy).toHaveBeenNthCalledWith(
        2,
        'translated',
        'en-IN',
        'hi-IN',
        'sarvam-translate:v1',
        expect.any(String),
      );
    });

    it('uses direct sarvam translation when sourceLang is provided', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      await service.translate('Hello world', 'ur-IN', 'ta-IN');

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'ta-IN',
        'ur-IN',
        'sarvam-translate:v1',
        expect.any(String),
      );
    });

    it('uses two-step translation for en-IN without sourceLang', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      const result = await service.translate('Hello world', 'en-IN');

      expect(result).toEqual({
        translated_text: 'translated',
      });

      expect(spy).toHaveBeenCalledTimes(1);

      expect(spy).toHaveBeenCalledWith(
        'Hello world',
        'auto',
        'en-IN',
        'mayura:v1',
        expect.any(String),
      );
    });

    it('splits large text into multiple chunks', async () => {
      const spy = vi.spyOn(service as any, '_callSarvamTranslate');

      const largeText = 'a'.repeat(2500);

      await service.translate(largeText, 'fr-FR');

      expect(spy.mock.calls.length).toBeGreaterThan(1);
    });

    it('joins translated chunks', async () => {
      vi.spyOn(service as any, '_callSarvamTranslate')
        .mockResolvedValueOnce('chunk1')
        .mockResolvedValueOnce('chunk2')
        .mockResolvedValueOnce('chunk3');

      const result = await service.translate('a'.repeat(2500), 'fr-FR');

      expect(result.translated_text).toContain('chunk1');
      expect(result.translated_text).toContain('chunk2');
    });
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

=>`backend/src/modules/context/tests/ContextRepository.integration.test.ts`
=> FOR: `backend/src/shared/database/providers/mongo/repositories/ContextRepository.ts`

```ts
import 'reflect-metadata';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as dotenv from 'dotenv';

dotenv.config({
  path: '.env.test',
});

import {MongoDatabase} from '#root/shared/database/providers/mongo/MongoDatabase.js';
import {ContextRepository} from '#root/shared/database/providers/mongo/repositories/ContextRepository.js';

const DB_URL = process.env.DB_URL!;
const DB_NAME = process.env.DB_NAME!;
console.log({
  DB_URL,
  DB_NAME,
});

const TS = Date.now();

const TEST_CONTEXT_TEXT = `
This is a context integration test.
Timestamp: ${TS}
`;

let db: MongoDatabase;
let repo: ContextRepository;
let createdContextId: string;

beforeAll(async () => {
  console.log('Creating db');

  db = new MongoDatabase(DB_URL, DB_NAME);

  console.log('Calling init');

  await db.init();

  console.log('Init complete');

  repo = new ContextRepository(db as any);

  console.log('Getting collection');

  const collection = await db.getCollection('contexts');

  console.log('Deleting');

  await collection.deleteMany({
    text: {$regex: `Timestamp: ${TS}`},
  });

  console.log('Done');
}, 30000);

afterAll(async () => {
  if (createdContextId) {
    const collection = await db.getCollection('contexts');

    const {ObjectId} = await import('mongodb');

    await collection.deleteOne({
      _id: new ObjectId(createdContextId),
    });
  }

  await db.disconnect();
}, 30000);

describe('ContextRepository integration', () => {
  it('addContext — inserts a new context', async () => {
    const result = await repo.addContext(TEST_CONTEXT_TEXT);

    expect(result).toBeDefined();
    expect(result.insertedId).toBeDefined();

    createdContextId = result.insertedId;
  }, 30000);

  it('addContext — document exists in database', async () => {
    const collection = await db.getCollection('contexts');

    const doc = await collection.findOne({
      text: TEST_CONTEXT_TEXT,
    });

    expect(doc).not.toBeNull();
  });

  it('getById — returns inserted context', async () => {
    const context = await repo.getById(createdContextId);

    expect(context).not.toBeNull();

    expect(context?._id?.toString()).toBe(createdContextId);

    expect(context?.text).toContain('This is a context integration test');
  }, 30000);

  it('getById — returns null for unknown id', async () => {
    const context = await repo.getById('664f00000000000000000099');

    expect(context).toBeNull();
  }, 30000);

  it('addContext — throws for empty text', async () => {
    await expect(repo.addContext('')).rejects.toThrow();
  }, 30000);

  it('addContext — throws for undefined text', async () => {
    await expect(repo.addContext(undefined as any)).rejects.toThrow();
  }, 30000);

  it('getById — throws for invalid object id', async () => {
    await expect(repo.getById('invalid-id')).rejects.toThrow();
  }, 30000);

  it('getById — throws for empty id', async () => {
    await expect(repo.getById('')).rejects.toThrow();
  }, 30000);
});
```

File naming:

```text

CropRepository.integration.test.ts

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

```
DB_URL=mongodb://localhost:27017
DB_NAME=ajrasakha_test
NODE_ENV=test
VAPID_EMAIL=test@test.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

- keep tests independent
- can generate your own keys using `npx web-push generate-vapid-keys`

---

## DON'T

- use production database
- call production APIs
- depend on cron jobs/workers
- initialize unnecessary infrastructure
- hardcode secrets

---

# Check Coverage

- to check if the unit tests are covering everything, use the following command:
  `pnpm vitest run --coverage`
- Open live server of the index file generated: `backend/src/coverage/html/index.html`

---

# Current Recommendation

For now, prefer writing:

1. Unit tests
2. Repository integration tests

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
