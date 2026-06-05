# ViBe Backend

> Modular, scalable backend powering the ViBe platform — built with TypeScript, Express, MongoDB, and InversifyJS.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Key Modules](#key-modules)
- [Shared Layer](#shared-layer)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Overview

ViBe Backend is a domain-driven, modular REST API that supports:

- **Authentication** — Firebase-based auth with JWT support
- **Course Management** — Full CRUD for courses, versions, modules, sections, and items (video, quiz, blog)
- **Quizzes** — Question banks, attempts, grading, and multiple question types
- **User Progress** — Enrollment tracking, watch time, and progress analytics
- **Notifications** — Invite management and email notifications
- **Anomaly Detection** — Monitoring suspicious user/course behavior
- **Settings** — Proctoring and custom configuration per user/course
- **GenAI** — Generative AI feature integration

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Web Server | Express + routing-controllers |
| Database | MongoDB (Repository pattern) |
| Dependency Injection | InversifyJS |
| Auth | Firebase Admin + JWT |
| Error Monitoring | Sentry |
| API Docs | OpenAPI via Scalar |
| Testing | Vitest |
| Containerization | Docker |

---

## Architecture

```
Client → Express Router → Controller → Service → Repository → MongoDB
                                 ↑
                         InversifyJS DI Container
```

- **Express** handles HTTP routing via `routing-controllers`
- **InversifyJS** wires controllers, services, and repositories through a central DI container
- **Repository pattern** abstracts all database access
- **Modular structure** — each domain (auth, courses, quizzes, etc.) is self-contained under `src/modules/`

---

## Directory Structure

```
backend/
├── plop-templates/         # Code generation templates
│   ├── controller.hbs
│   ├── repository.hbs
│   ├── service.hbs
│   └── module-base/
├── src/
│   ├── bootstrap/          # Module loader and startup logic
│   ├── config/             # App, DB, AI, SMTP, storage configs
│   ├── container.ts        # Inversify DI container setup
│   ├── index.ts            # Entry point
│   ├── modules/            # Domain-driven business logic
│   │   ├── anomalies/
│   │   ├── auth/
│   │   ├── courses/
│   │   ├── genAI/
│   │   ├── notifications/
│   │   ├── quizzes/
│   │   ├── settings/
│   │   └── users/
│   ├── shared/             # Common utilities, interfaces, middleware
│   │   ├── classes/
│   │   ├── constants/
│   │   ├── database/
│   │   ├── functions/
│   │   ├── interfaces/
│   │   └── middleware/
│   └── utils/              # env, logging, type helpers
├── .example.env
├── Dockerfile
├── plopfile.cjs
├── tsconfig.json
└── README.md
```

> **Note:** Compiled output goes to `build/` — do not edit directly.

---

## Key Modules

### `auth`
Firebase-based authentication — signup, login, password management, and token verification via `FirebaseAuthService`.

### `courses`
Full lifecycle management for courses, versions, modules, sections, and content items (video, quiz, blog) via `CourseRepository`.

### `quizzes`
Question banks, quiz attempts, grading engine, and settings. Supports question types:

| Type | Description |
|---|---|
| SOL | Single Option (MCQ) |
| SML | Select Multiple |
| MTL | Match the Following |
| OTL | Ordering |
| NAT | Numerical Answer |
| DES | Descriptive |

### `users`
Enrollment, progress tracking, and watch time via `EnrollmentService` and `ProgressService`.

### `notifications`
Invite management and email delivery via `InviteRepository` and `MailService`.

### `settings`
Proctoring configuration and custom settings per user/course via `SettingsRepository`.

### `anomalies`
Detects and logs suspicious behavior patterns for monitoring and security review.

### `genAI`
Generative AI feature integration (model-agnostic, configurable via `config/ai.ts`).

---

## Shared Layer

| Folder | Purpose |
|---|---|
| `classes/` | Base service and utility classes |
| `constants/` | App-wide constants |
| `database/` | MongoDB connection, base repositories, CRUD interfaces |
| `functions/` | OpenAPI spec generation, auth helpers, current user checker |
| `interfaces/` | TypeScript interfaces for models and DTOs |
| `middleware/` | Logging, error handling, request lifecycle |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- MongoDB instance
- Firebase project
- pnpm

### Installation

```bash
git clone https://github.com/vicharanashala/ajrasakha.git
cd ajrasakha
pnpm install
```

### Running Locally

```bash
cp .example.env .env
# Fill in required values in .env
pnpm dev
```

### Scaffold a New Module

```bash
pnpm plop
```

Follow the prompts to generate a controller, service, and repository for a new domain module.

---

## Environment Variables

See `.example.env` for all required variables. Key categories:

- **Database** — MongoDB connection URI
- **Firebase** — Service account credentials
- **Sentry** — DSN for error monitoring
- **SMTP** — Email service credentials
- **Storage** — File storage config
- **AI** — GenAI provider keys

> Never commit `.env` to version control.

---

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript to `build/` |
| `pnpm start` | Run compiled server |
| `pnpm test` | Run Vitest test suite |
| `pnpm plop` | Scaffold new module via Plop |
| `generate-openapi.cjs` | Generate OpenAPI spec from codebase |
| `start.sh` | Production startup script |

---

## API Reference

Live OpenAPI docs are auto-generated and available at:

```
http://localhost:<PORT>/reference
```

Powered by [Scalar](https://scalar.com/) — interactive, always in sync with the codebase.

---

## Testing

```bash
pnpm test
```

Tests are written with [Vitest](https://vitest.dev/). Unit and integration tests are colocated with their respective modules.

---

## Deployment

### Docker

```bash
docker build -f Dockerfile -t vibe-backend .
docker run --env-file .env -p 3000:3000 vibe-backend
```

Use `Dockerfile-all` for an all-in-one deployment.

### Monitoring

Sentry is integrated for real-time error tracking and performance profiling in production and staging environments.

---

## Contributing

1. Use **Plop templates** (`pnpm plop`) to scaffold new controllers, services, and repositories — keep the module structure consistent.
2. Register new controllers, services, and repositories in the module's `index.ts` and the global DI container.
3. Follow the Repository pattern — no direct DB calls outside of `*Repository` classes.
4. All new code in TypeScript with proper type annotations.
5. Write tests in Vitest for any new services or utilities.

---

<p align="center">Built with ❤️ by the ViBe team</p>
