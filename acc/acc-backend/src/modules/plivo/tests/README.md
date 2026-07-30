# ACC Microservice Automated Tests

These tests target the standalone ACC backend introduced on
`refactor/ACC-microservice`:

```text
acc/acc-backend
```

They verify ACC-owned orchestration and contracts. Plivo, Sarvam AI, WebSocket
connections, MongoDB repositories, and other external integrations are mocked
in the default mocked suite below. The Layer 4 integration suites (further
down) trade some of those mocks for the real thing - a real local MongoDB, a
real Express/HTTP boundary, and a real local WebSocket server - while still
keeping genuinely external third parties (Plivo, Sarvam, Firebase) faked. No
test calls a real phone number, external API, Firebase project, or production
database.

## Coverage

### Agent availability

- Online and offline state
- Lowest available agent number
- Busy and available transitions
- No-agent behavior
- Role validation
- Heartbeat updates
- Inactive-agent heartbeat cleanup

### Call routing

- Atomic agent reservation through `AgentAssignmentService`
- Plivo XML and dual-track stream configuration
- No-agent busy response
- Reserved-agent recovery after routing failure
- Agent release through the Plivo call-ended webhook

### Sarvam speech

- Four sockets per call
- `saaras:v3` transcribe and translate modes
- Protection against `mayura:v1` in speech sockets
- Audio payload format
- Transcript, translation, and language events
- API and socket error handling
- Flush and socket closure
- Active-call socket reconnection
- Stale in-memory session cleanup

### Call wrap-up

- Call metadata and participant transcript persistence
- Existing-call update behavior
- Persistence when Plivo metadata is unavailable
- Safe repository failure handling
- Transcript and agent-mapping cleanup

### Concurrent assignment

- Different agents for simultaneous calls
- Capacity overflow behavior
- Isolated agent release
- Released-agent reuse

The concurrency suite tests the atomic repository contract with a deterministic
mock. It is not a real MongoDB load test.

### Complete lifecycle

- Answer webhook
- Agent reservation and connection XML
- WebSocket stream start
- Inbound and outbound audio forwarding
- Live dashboard transcript
- Stream stop and call persistence
- In-memory cleanup
- Call-ended webhook agent release
- Duplicate wrap-up prevention

### Scalar/OpenAPI documentation

- ACC API title and OpenAPI version
- Plivo answer and call-ended webhook paths
- Plivo tag grouping
- Bearer authentication scheme

The Scalar UI is mounted by the ACC microservice at:

```text
/api/reference
```

### MongoDB integration tests (Layer 4)

Unlike the suites above, these run against a real `mongod` via
`mongodb-memory-server` (an isolated, local, in-memory instance - no
production database or Docker required). Only the MongoDB boundary is real;
Plivo, Sarvam, and Firebase are still out of scope here.

`mongo-agent-reservation.integration.test.ts`

- Concurrent calls never reserve the same agent (`findAndMarkAvailableAgent`
  under real concurrent `findOneAndUpdate` operations, not a mock)
- Lowest-numbered available agent is reserved first
- No-agent-available returns null
- Inactive or unassigned agents are ignored
- A single agent is never double-booked under a burst of concurrent calls
- Distinct agents are reserved per call when there is enough capacity

`mongo-call-details-duplicate.integration.test.ts`

- The unique `callUuid` index on `call_details` is actually created
- Concurrent creates with the same `callUuid` persist exactly one document
- A repeated create does not overwrite the original document
- Distinct call UUIDs persist independently

These are run separately from the mocked suites, since they exercise real
MongoDB behavior (Vitest config: `vite.integration.config.ts`,
`include: ['*.integration.test.ts']`). The default `pnpm test` run excludes
them and stays fully mocked, per the testing principles.

### HTTP integration tests (Layer 4)

`http-plivo-endpoints.integration.test.ts` boots the **real** Express +
`routing-controllers` app the same way `index.ts` does - real middleware
chain, real route registration, real class-validator/body-parser behavior,
real DI container wired to a `mongodb-memory-server` instance - and drives it
with `supertest`. Only Plivo (the SDK client) and Firebase (`verifyIdToken`)
are mocked; everything else, including the Express/HTTP boundary and MongoDB,
is real. Harness: `helpers/http-app.ts`.

Coverage:

- `GET /api/health` returns a healthy status body
- CORS preflight (`OPTIONS`) returns 204 with the allow-* headers
- `GET /api/reference` actually serves the Scalar/OpenAPI HTML page
- An unregistered route returns 404
- `POST /api/plivo/answer` returns busy XML with no agent available, and
  dial XML + a real Mongo agent reservation when one is
- `POST /api/plivo/webhook/call-ended` releases the real agent holding the
  call
- `@Authorized()` routes: no token, a token that fails verification, and a
  verified token with no matching DB user all return 401; an authenticated
  but wrong-role user gets the controller's own 400; a correctly authenticated
  `call_agent` gets 200
- `/send-message` request validation: missing fields returns 400

KNOWN FINDINGS (not fixed - testers only, no app-code changes made):

- A malformed JSON request body on *any* endpoint returns **500**, not 400.
  `body-parser`'s `SyntaxError` carries `status: 400`, but
  `HttpErrorHandler` (`shared/middleware/errorHandler.ts`) only special-cases
  `UnauthorizedError`/`HttpError`; every other `instanceof Error` - including
  this one - is flattened to 500 without checking `err.status`/`err.statusCode`.
  The test asserts the actual (buggy) 500 rather than the expected 400, with
  a comment explaining why.

- `POST /api/plivo/answer` and `POST /api/plivo/webhook/call-ended` **log a
  false `Status: 500`** in the access log on every successful call, even
  though the client genuinely receives 200. Root cause: both handlers use
  `@Res() res` and call `res.send(...)`/`res.status(200).send('OK')` without
  `return`ing it, so their `async` method resolves to `undefined`.
  `routing-controllers`' `ExpressDriver.handleSuccess()` treats an
  `undefined` result as "the controller never handled the response" (unless
  the return value `=== options.response`) and throws a `NotFoundError`,
  which flows into `handleError()` and tries to send a *second* response
  body on a connection whose headers are already flushed - Express throws
  `ERR_HTTP_HEADERS_SENT`, which is itself caught one level up and re-enters
  `handleError()` a second time with an error that has no `.httpCode`,
  landing on `response.status(500)`. That call is a harmless in-memory
  property write at that point (the real bytes already reached the client),
  but it corrupts `res.statusCode` for anything reading it afterward -
  including `loggingHandler`'s `res.on('finish')` line. Any monitoring or
  alerting built on these access logs would see a 100% error rate on two of
  the highest-traffic endpoints in the call-routing path, even when the
  service is working correctly. Reproduced in
  `http-plivo-endpoints.integration.test.ts` by spying on `console.log` and
  asserting the false `Status: 500` line appears alongside a genuinely
  200/OK client response.

### WebSocket integration tests (Layer 4)

`ws-plivo-stream.integration.test.ts` boots the **real** `/plivo-stream`
WebSocket server (`bootstrap/websocket.ts`) on a real `http.Server`, wired to
the same real Express/DI/MongoDB stack as the HTTP layer, and drives it with
real `ws` client connections. Only the Plivo SDK client and the *outbound*
Sarvam speech sockets are faked - the local server, the simulated "Plivo
media stream" client, and any "dashboard" clients are genuine WebSocket
connections over a real ephemeral port. Harness: `helpers/ws-app.ts`.

This harness uses a real 1-node `MongoMemoryReplSet` rather than a
standalone `mongodb-memory-server`, because the WS `stop`/`close` handler's
call to `UserService.markAgentAsAvailable` runs inside a real Mongo
transaction (`BaseService._withTransaction`), which a standalone instance
rejects outright. A replica set matches how production Mongo (Atlas) is
always deployed.

Coverage:

- Full call lifecycle: a real `/api/plivo/answer` reservation, a simulated
  Plivo media stream (`start` -> `media` -> `stop`), a mocked Sarvam
  transcript response, and a "dashboard" client (authenticated as the
  assigned agent) receiving `call_start`, `transcript`, and `call_end`
  messages - with the real Mongo agent doc released and `call_details`
  persisted afterward
- Targeting: an unrelated authenticated agent does *not* receive a call's
  transcript; an `admin`/`moderator` does, alongside the assigned agent
- A call with no assigned agent broadcasts to every connected client
- A client that never sends `start` only ever triggers `call_disconnected`
  on close - no agent release, no `call_end`
- A non-JSON WebSocket message doesn't crash the connection (the existing
  `try/catch` swallow in the `message` handler keeps working)

## Running the tests

First install the existing ACC backend dependencies from `acc/acc-backend`:

```powershell
pnpm install
```

Then install and run the isolated test tooling from
`acc/acc-backend/src/modules/plivo/tests`:

```powershell
pnpm install
pnpm test
```

Run one file from the test directory:

```powershell
pnpm vitest run sarvam-speech-contract.test.ts
```

Run the MongoDB integration suite (downloads a local MongoDB binary via
`mongodb-memory-server` on first run, cached afterward):

```powershell
pnpm test:integration
```

## Scope

- No production implementation files are modified by this test suite.
- Test tooling is isolated in this directory, so the ACC backend package and
  TypeScript configuration do not need to be changed.
- Speech recognition and translation quality are out of scope.
- Real phone audio quality and Plivo internal behavior are out of scope.
- Database-backed race tests now run against a real local MongoDB instance
  (see Layer 4 above). Performance/load tests still require agreed production
  targets before implementation.
