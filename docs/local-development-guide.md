# Local Development & Setup Guide

This guide provides instructions for setting up, running, and testing the **Ajrasakha** platform on your local development machine outside of production containers.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Running the Backend](#running-the-backend)
- [Running the Frontend](#running-the-frontend)
- [Full Stack with Docker Compose](#full-stack-with-docker-compose)
- [Running Tests](#running-tests)
- [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Prerequisites

Before starting, ensure you have the following installed:

| Tool | Recommended Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.x` | Runtime for Backend & Frontend |
| **pnpm** | `>= 10.x` | Monorepo/Workspace Package Manager |
| **MongoDB** | `>= 6.0` | Local database (or MongoDB Atlas cluster URI) |
| **Git** | `>= 2.40` | Version Control |
| **Python** *(Optional)* | `>= 3.11` | Required if working with `ai/` or `mcp/` services |
| **Docker** *(Optional)* | Latest | For running the full stack containerized |

To verify your environment:
```bash
node -v
pnpm -v
git --version
```

---

## Environment Configuration

1. In the repository root, copy `.env.example` to create your local `.env`:
   ```bash
   cp .env.example .env
   ```

2. Configure the core local settings in `.env`:
   ```env
   # Core Ports
   APP_PORT=4000
   BACKEND_HOST_PORT=4000
   FRONTEND_PORT=5173
   APP_ROUTE_PREFIX=/api
   NODE_ENV=development

   # Database (Local or Atlas)
   DB_URL=mongodb://localhost:27017/ajrasakha
   DB_NAME=ajrasakha
   # Set to true to test API routes without an active MongoDB connection
   SKIP_DB_CONNECTION=false

   # Admin credentials
   ADMIN_PASSWORD=your_local_admin_password
   ```

> [!TIP]
> Never commit your actual `.env` file or sensitive service account JSON keys to git.

---

## Running the Backend

The backend is built with **Node.js**, **Express**, and **InversifyJS**.

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```

2. Install dependencies (this also runs post-install dependency linking):
   ```bash
   pnpm install
   ```

3. *(Optional)* Start local Firebase emulators for auth and storage:
   ```bash
   pnpm run emulators
   ```

4. Start the backend development server (runs concurrent watchers for TypeScript compilation and nodemon restart):
   ```bash
   pnpm run dev
   ```

The backend API will be available at: **`http://localhost:4000/api`**

---

## Running the Frontend

The frontend is built with **React**, **TypeScript**, **Tailwind CSS**, and **Vite**.

1. Open a new terminal and navigate to `frontend/`:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the Vite development server:
   ```bash
   pnpm dev
   ```

The web application will open at: **`http://localhost:5173`**  
*(API requests to `/api` are automatically proxied to `http://localhost:4000` via Vite)*.

---

## Full Stack with Docker Compose

If you prefer to run the entire stack (Nginx, Backend, and Frontend) inside containers:

```bash
# Build and run the app stack locally
docker compose -f docker-compose.app.yml up --build
```

To stop containers:
```bash
docker compose -f docker-compose.app.yml down
```

---

## Running Tests

### Backend Unit Tests
From the `backend/` directory, execute:
```bash
# Run Vitest test runner
pnpm test

# Run tests in watch mode
pnpm run test:watch
```

### Frontend Tests
From the `frontend/` directory, execute:
```bash
pnpm test
```

---

## Troubleshooting & FAQ

### 1. `link-testers-dashboard-deps.js` symlink errors on Windows
If `pnpm install` throws permissions errors when creating symlinks for `testers-dashboard`:
- Ensure **Developer Mode** is enabled in Windows Settings (Settings → System → For Developers → Developer Mode).
- Alternatively, run your terminal as Administrator during initial install.

### 2. Database connection timeouts
If the backend fails to connect to MongoDB:
- Ensure your local MongoDB service is running (`net start MongoDB` on Windows).
- If developing offline or working exclusively on frontend/static routes, set `SKIP_DB_CONNECTION=true` in your `.env`.

### 3. Firebase Authentication credentials
For local testing without a live GCP Service Account key, run `pnpm run emulators` in `backend/` to start the local Firebase emulator suite.
