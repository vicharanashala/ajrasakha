# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Scope: this file documents the **`backend/`** service only. The repo monorepo also contains `frontend/`, `ai/`, `apis/`, and `mcp/`, which are out of scope here.

## What this service is

AjraSakha backend (package name `vitest-vibe`) — a TypeScript/Express API for an **agricultural expert-review Q&A platform**. Farmer/outreach questions flow in (web, WhatsApp, Plivo voice calls, outreach), get AI-assisted draft answers, and are routed to a tiered pool of human reviewers (`expert`, `pae_expert`, `moderator`, `admin`) who answer, review, and approve them through a multi-stage workflow before closing.

The codebase descends from an older "ViBe" courses/quizzes platform — ignore `backend/README.md`, which still describes that old domain and is **stale**. The DI `imports` map in `package.json` (`#courses/*`, `#quizzes/*`, etc.) and the `tsconfig.json` `paths` entries are likewise vestigial; the real modules are the agriculture domain ones listed below.

## Commands

All commands run from `backend/`. Package manager is **pnpm@10.4.1** (do not use npm/yarn).

```bash
pnpm install            # also runs a postinstall patch (scripts/class-transformer-0.5.1.patch.js)
pnpm run build          # tsc → ./build  (noEmitOnError: true, so type errors fail the build)
pnpm dev                # tsc --watch + nodemon re-running build/index.js on change
pnpm start              # run compiled build/index.js (expects a prior build)
pnpm run generate       # plop scaffolder for a new module/controller/service/repository
```

### Tests (Vitest)

```bash
pnpm test               # NODE_ENV=test vitest --ui  (interactive)
pnpm run test:watch     # NODE_ENV=test vitest run --watch
pnpm run test:ci        # run once with v8 coverage + html report

# run a single file / filter by name
NODE_ENV=test pnpm exec vitest run src/modules/question/tests/QuestionService.unit.test.ts
NODE_ENV=test pnpm exec vitest run -t "creates context successfully"
```

Vitest is configured (`vite.config.ts`) to compile with **SWC** (for decorator + `reflect-metadata` support) and to resolve the `#root/*`, `#shared/*` path aliases via `vite-tsconfig-paths`. Only files matching `*.unit.test.ts`, `*.integration.test.ts`, `*.api.test.ts`, `*.e2e.test.ts` are picked up.

## Test conventions (see `Backend Testing Guidelines.md`)

Tests live in each module's `tests/` folder, named by layer:

| Suffix                  | Tests                          | Strategy |
| ----------------------- | ------------------------------ | -------- |
| `*.unit.test.ts`        | service / controller logic     | mock the injected service/repo |
| `*.integration.test.ts` | repository ↔ MongoDB           | real DB driver |
| `*.api.test.ts`         | controller HTTP endpoints      | supertest + a hand-built Inversify `Container` |

API tests bypass `loadAppModules` entirely: they construct a fresh `Container`, bind the controller `.toSelf()` and bind each `GLOBAL_TYPES.XService` to a `vi.fn()` mock via `toConstantValue`, wire it with `new InversifyAdapter(container)` + `useExpressServer`, and stub `authorizationChecker`/`currentUserChecker`. Copy an existing one (e.g. `src/modules/context/tests/ContextController.api.test.ts`) as a template.

## Architecture

### Module/DI system (the important part to understand first)

The app is built around **Express + `routing-controllers` + InversifyJS** with a custom dynamic module loader. Read these together: `src/index.ts`, `src/bootstrap/loadModules.ts`, `src/container.ts`, `src/types.ts`.

- **`loadAppModules(moduleName)`** (`src/bootstrap/loadModules.ts`) scans `src/modules/*` (or `build/modules/*` in prod/staging — note the env-dependent path) and, for each `<mod>/index.js`, imports conventionally-named exports:
  - `<mod>ModuleControllers` → controller classes registered with Express
  - `<mod>ModuleValidators`   → DTO classes used for OpenAPI schema generation
  - `<mod>ContainerModules`    → Inversify `ContainerModule[]`
  - `setup<Mod>Container()`    → used only when running a single module (`APP_MODULE` ≠ `all`)
  - With `APP_MODULE=all` (the default), all modules' container modules are deduped, loaded into one root `Container`, and wired in via `InversifyAdapter`.
- **DI symbols**: global bindings (DB, auth, cross-module services) live in `src/types.ts` as `GLOBAL_TYPES`; the core domain has its own `CORE_TYPES` in `src/modules/core/types.ts`. Controllers `@inject(GLOBAL_TYPES.XService)` and depend on the **interface** (`IXService`), never the concrete class.
- A module is "real" only if its `index.ts` exports the `<mod>Module*` names. Several domain folders — **`answer`, `comment`, `context`, `question`, `request`, `performance`** — have **empty `index.ts`/`container.ts`/`types.ts`**. That is intentional: they are aggregated and wired by the **`core`** module (`src/modules/core/`), which imports their controllers/services/validators and binds their repositories. When adding a controller to one of those folders, register it in `src/modules/core/{index,container}.ts`, not in the folder's own `index.ts`.

### Per-module layout

A populated module follows this shape (`answer` is a good reference):

```
modules/<name>/
  index.ts          # module exports for the loader (or empty if wired via core)
  container.ts      # Inversify bindings (or empty if wired via core)
  types.ts          # DI Symbols (or empty if wired via core)
  controllers/      # @JsonController classes, @Authorized, @OpenAPI-annotated
  services/         # business logic, depend on repository interfaces
  interfaces/       # I<Name>Service contracts
  classes/
    validators/     # class-validator DTOs (request bodies / params)
    transformers/   # response shaping
```

Standalone (non-core) modules include `auth`, `user`, `crop`, `chemical`, `chatbot`, `notification`, `whatsapp`, `plivo`, `reroute`, `ai`, `auditTrails`, `dashboard`.

### Data layer

Repositories are **not** co-located with modules — they all live under `src/shared/database/providers/mongo/repositories/` and implement interfaces in `src/shared/database/interfaces/` (`IQuestionRepository`, `IAnswerRepository`, etc.). The MongoDB connection is a singleton `MongoDatabase` (plus separate `AnalyticsMongoDatabase` and `AnnamDatabase` for analytics DBs). Domain model interfaces are centralized in `src/shared/interfaces/models.ts` — start there for `IUser`, `IQuestion`, `IAnswer`, the `QuestionStatus`/`UserRole`/`QuestionSource` unions, and the review/SLA fields.

### Auth

Firebase Admin–based. `authorizationChecker`/`currentUserChecker` (`src/shared/functions/`) verify the `Authorization: Bearer <token>` header via `FirebaseAuthService` and populate `@CurrentUser()`. Controllers gate access with `@Authorized()`. Internal service-to-service calls use `InternalApiAuth` + the `x-internal-api-key` header. Roles are `admin | moderator | expert | pae_expert | tester`; many write endpoints call `verifyNotTester(user)` to block `tester` accounts from mutating data.

### Server entry & cross-cutting

`src/index.ts` boots Sentry first (`instrument.ts`), sets up manual CORS + `routing-controllers`, serves the built frontend from `../../frontend/dist` (SPA fallback for non-`/api` GETs), proxies `/api/faq` and `/api/pop` to upstream services, mounts a WebSocket server (`bootstrap/websocket.ts`), and exposes Scalar OpenAPI docs at `${APP_ROUTE_PREFIX}/reference` and a healthcheck at `${APP_ROUTE_PREFIX}/health`.

### Background work

- **Cron jobs** (`src/bootstrap/jobs/`, started in `initJobs()` on listen): SLA/reallocation crons, daily reports, DB backups, embedding backfill, notification cleanup, question-status sweeps.
- **Worker threads** (`src/workers/`): CPU-heavy batch work (workload balancing, bulk delete, PAE allocation, crop/chemical bulk processing, question processing) via a manager/worker pair pattern.

## Code generation

`pnpm run generate` (plop, config in `plopfile.cjs`, templates in `plop-templates/`) scaffolds a controller/service/repository for a module and creates the base `index.ts`/`container.ts`/`types.ts` if missing. Useful for keeping the loader's export-name conventions consistent.

## Configuration

Config modules in `src/config/` read from env (`.env`, not committed; see repo-root `.env.example` and `SETUP.md`). Key vars: `APP_MODULE` (`all` or a single module name), `APP_ROUTE_PREFIX` (default `/api`), `APP_PORT`, `DB_URL`/`DB_NAME`, the analytics DB triplet, Firebase admin creds, `ENABLE_AI_SERVER` + `AI_SERVER_*`/`AGENT_SERVER_*`, `SARVAM_API_KEY`, VAPID push keys, and `SENTRY_DSN`. `NODE_ENV` of `production`/`staging` enables Sentry error handling and switches the module loader to read from `build/`.
