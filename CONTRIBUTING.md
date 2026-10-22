# Contributing to Ajrasakha (Annam AI)

Thank you for your interest in contributing to **Ajrasakha**! We welcome contributions from open-source contributors, student interns, and agricultural technology enthusiasts.

---

## 🚨 The Golden Rule: Issue-First Policy

To maintain repository quality, avoid duplicate effort, and streamline reviews:

1. **Never open a PR without an assigned or approved issue.**
2. **Check Existing PRs & Issues First:** Before starting work, browse existing [open PRs](https://github.com/vicharanashala/ajrasakha/pulls) and [open issues](https://github.com/vicharanashala/ajrasakha/issues) to ensure someone is not already solving the problem.
3. **Claim an Issue:** Comment on an open issue with:
   > *"I would like to work on this issue. Please assign it to me."*
   Wait for a maintainer or mentor to confirm before you begin writing code.

---

## 🛠️ Getting Started

### 1. Fork and Clone
1. Fork the repository to your own GitHub account.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/ajrasakha.git
   cd ajrasakha
   ```
3. Add the upstream remote to stay in sync:
   ```bash
   git remote add upstream https://github.com/vicharanashala/ajrasakha.git
   ```

### 2. Branching Guidelines
Create a dedicated descriptive branch from `main`:
```bash
git checkout -b <type>/<short-description>
```
*Examples:*
- `fix/rerouted-question-status`
- `feat/mandi-gujarat-mcp`
- `docs/contributing-guidelines`
- `test/reviewer-e2e-playwright`

---

## 🏗️ Repository Architecture

- **`frontend/`**: React + TypeScript UI for the farmer-facing chat application.
- **`backend/`**: Node.js + Express API services handling question routing, allocation, and review workflows.
- **`ai/`**: AI pipeline scripts, model integrations (Ollama, Sarvam AI), and evaluation harnesses.
- **`apis/`**: Core API definitions and external data clients.
- **`mcp/`**: Model Context Protocol servers for agricultural data (mandi prices, weather, schemes).
- **`testers-dashboard/`**: Specialized validation and QA dashboard.

---

## 🧪 Testing & Code Quality

Before opening a PR, ensure your changes adhere to project standards:
- **Linting & Formatting:** Keep your code clean, typed, and formatted.
- **Do Not Break Existing Suites:** If modifying backend endpoints or UI components, verify local tests.
- **Atomic Commits:** Make focused commits with clear messages (e.g. `feat(backend): add validation for reroute endpoint`).

---

## 🚀 Submitting Your Pull Request

1. Push your branch to your fork:
   ```bash
   git push -u origin <type>/<short-description>
   ```
2. Open a Pull Request against `vicharanashala/ajrasakha:main`.
3. In the PR description:
   - Reference the issue being resolved: `Fixes #<issue-number>` or `Closes #<issue-number>`.
   - Explain **what** changed and **why**.
   - Attach screenshots or test output for UI/API changes.
4. Keep PRs **atomic and single-purpose**. Avoid bundling unrelated refactors into a feature PR.
