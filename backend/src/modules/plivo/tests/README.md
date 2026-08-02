# ACC Automated Tests

This directory contains the first-pass automated contract and orchestration tests
for the Agricultural Call Center (ACC).

The tests verify ACC-owned behavior only. Plivo, Sarvam AI, WebSocket connections,
MongoDB repositories, and other external integrations are mocked. No test in this
directory calls a real phone number, external API, or production database.

## Test files

### `agent-availability-management.test.ts`

Verifies that:

- the first online call agent receives `agent_1`;
- the next online call agent receives the next available number;
- taking an agent offline resets availability and call state;
- routing selects the lowest-numbered free agent;
- busy agents are skipped;
- no available agent returns `null`;
- assignment marks an agent busy and records the call UUID;
- call completion makes the agent available again; and
- non-call-agent users cannot register as available.

Heartbeat cleanup remains an explicit `it.todo`. The architecture describes a
cleanup job, but no testable heartbeat-cleanup implementation entry point was
found in the current source tree.

### `sarvam-speech-contract.test.ts`

Verifies that:

- one call opens four Sarvam sockets: inbound/outbound transcribe and translate;
- speech sockets use `/speech-to-text/ws`;
- the model is `saaras:v3`;
- the modes are `transcribe` and `translate`;
- sample rate and codec parameters are correct;
- no speech socket uses the text-translation model `mayura:v1`;
- audio is sent as the expected base64 JSON payload;
- transcript, translation, detected-language, API-error, and socket-error events
  are handled safely; and
- call completion flushes and closes every Sarvam socket.

### `call-routing.test.ts`

Verifies that:

- an incoming Plivo call uses atomic agent reservation;
- the selected agent and call UUID are mapped in `PlivoService`;
- the XML streams both audio tracks before dialing the browser endpoint;
- no-agent routing speaks the busy message and hangs up without dialing;
- the call UUID can be read from Plivo's query string; and
- an agent reserved before a routing failure is released.

### `call-wrap-up.test.ts`

Verifies that:

- Plivo call metadata, both participant transcripts, translations, detected
  languages, and the agent mapping are persisted;
- an existing call record is updated instead of duplicated;
- captured transcripts are still saved if Plivo metadata cannot be fetched;
- repository failure is handled without crashing wrap-up; and
- cleanup removes transcripts, translations, detected language, and agent
  mapping from in-memory call state.

### `concurrent-multi-agent.test.ts`

Verifies the service contract for concurrent routing:

- simultaneous calls receive different free agents;
- each assignment records its own call UUID;
- excess calls receive no assignment when all agents are busy;
- completing one call does not release another call's agent; and
- only the released agent is reused for the next call.

These are mocked first-pass concurrency tests. They exercise the atomic repository
boundary used by `AgentAssignmentService`; they are not a real MongoDB concurrency
or load test.

### `complete-agent-session-lifecycle.test.ts`

Provides a mocked end-to-end ACC orchestration test covering:

- the Plivo answer webhook atomically reserving an agent;
- generation of the agent connection XML;
- creation of the backend media-stream session;
- forwarding inbound farmer and outbound agent audio;
- broadcasting mocked Sarvam transcript and translation events to the dashboard;
- processing remaining audio when Plivo sends the stop event;
- broadcasting the final dual-participant transcript;
- saving call details before in-memory cleanup;
- releasing the assigned agent after cleanup; and
- preventing a later socket-close event from running wrap-up twice.

This is an end-to-end orchestration test within the backend process. External
services and the database remain mocked, so it is deterministic and safe for CI.

## Run the tests

From `backend`:

```powershell
pnpm vitest run src/modules/plivo/tests/agent-availability-management.test.ts
pnpm vitest run src/modules/plivo/tests/sarvam-speech-contract.test.ts
pnpm vitest run src/modules/plivo/tests/call-routing.test.ts
pnpm vitest run src/modules/plivo/tests/call-wrap-up.test.ts
pnpm vitest run src/modules/plivo/tests/concurrent-multi-agent.test.ts
pnpm vitest run src/modules/plivo/tests/complete-agent-session-lifecycle.test.ts
```

Run all ACC tests together:

```powershell
pnpm vitest run src/modules/plivo/tests
```

## Scope and safety

- Production and source implementation files were not modified.
- Real MongoDB, Firebase, Plivo, and Sarvam services are not used.
- Speech recognition and translation quality are intentionally not tested.
- Plivo's internal audio behavior and real phone-call quality are out of scope.
- Performance thresholds and load tests should be added only after expected
  production concurrency and latency targets are confirmed.
