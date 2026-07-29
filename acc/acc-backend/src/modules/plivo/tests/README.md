# ACC Microservice Automated Tests

These tests target the standalone ACC backend introduced on
`refactor/ACC-microservice`:

```text
acc/acc-backend
```

They verify ACC-owned orchestration and contracts. Plivo, Sarvam AI, WebSocket
connections, MongoDB repositories, and other external integrations are mocked.
No test calls a real phone number, external API, Firebase project, or production
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

## Scope

- No production implementation files are modified by this test suite.
- Test tooling is isolated in this directory, so the ACC backend package and
  TypeScript configuration do not need to be changed.
- Speech recognition and translation quality are out of scope.
- Real phone audio quality and Plivo internal behavior are out of scope.
- Database-backed race and performance tests require agreed production targets
  and an isolated integration environment.
