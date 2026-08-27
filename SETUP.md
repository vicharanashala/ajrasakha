# AjraSakha Development Setup Guide

Complete setup instructions for the frontend and backend of the AjraSakha project.

### System Requirements

- **Node.js**: v14 or higher
- **pnpm**: v10.4.1 or higher (package manager)
- **MongoDB**: v6.0 or higher (for backend)
- **Docker** (optional, for containerized setup)
- **Docker Compose** (optional, for multi-container setup)

### Installation

1. **Install Node.js**
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node -v` and `npm -v`

2. **Install pnpm**

   ```bash
   npm install -g pnpm@10.4.1
   ```

   - Verify installation: `pnpm -v`

3. **Install MongoDB** (if running locally)
   - Download from [mongodb.com](https://www.mongodb.com/try/download/community)
   - Or use Docker: `docker run -d -p 27017:27017 --name mongodb mongo`

---

## Backend Setup

### 1. Installation

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pnpm install
```

### 2. Environment Configuration

Copy the example environment file and configure it:

```bash
# Copy example environment file
cp .example.env .env
```

Edit `.env` and fill in the required values:

```env
NODE_ENV="development"

DB_URL=""
DB_NAME_copy=""
DB_NAME=""
DB_URL_ANALYTICS="your_analytics_url"
DB_NAME_ANALYTICS='test'

ENABLE_DB_BACKUP=false

ANNAM_URL_ANALYTICS=
ANNAM_DB_ANALYTICS='test'

APP_PORT="4000"
APP_ORIGINS="http://localhost:5173"
APP_MODULE="all"
APP_ROUTE_PREFIX="/api"
APP_URL="http://localhost:4000"

FIREBASE_CLIENT_EMAIL_copy=""
FIREBASE_PRIVATE_KEY_copy="-----BEGIN PRIVATE KEY-----\nMII..."
FIREBASE_PROJECT_ID_copy=""
FIREBASE_API_KEY_copy=""
FIREBASE_CLIENT_EMAIL=""
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----...."
FIREBASE_PROJECT_ID=""
FIREBASE_API_KEY=""

AI_SERVER_IP=
AI_SERVER_PORT=6001
AGENT_SERVER_IP=
AGENT_SERVER_PORT=8000
SARVAM_API_KEY=

VITE_ENABLE_MOCKS=false
VITE_API_BASE_URL=http://localhost:4000/api

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=
VITE_VAPID_PUBLIC_KEY=

EMAIL_USER_copy=
EMAIL_PASS_copy=

ENABLE_AI_SERVER=false

EMAIL_USER=
EMAIL_PASS=


```

### 3. Build

```bash
# Compile TypeScript to JavaScript
pnpm run build
```

### 4. Running the Backend

#### Development Mode (with hot reload)

```bash
# Run TypeScript compiler in watch mode + auto-reload
pnpm dev
```

Server will start at `http://localhost:3000`

#### Production Mode

```bash
# Start compiled server
pnpm start
```

### 5. API Documentation

Once the server is running, visit:

- **OpenAPI Documentation**: `http://localhost:3000/reference`

---

## Frontend Setup

### 1. Installation

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
pnpm install
```

### 2. Environment Configuration

Create a `.env` file :

```bash
# Copy if .example.env exists
# cp .example.env .env


```

Edit `.env` and fill in the required values:

```
VITE_ENABLE_MOCKS=
VITE_API_BASE_URL=http://localhost:4000/api

# Fire base credentials
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

VITE_SARVAM_API_KEY=

VITE_VAPID_PUBLIC_KEY=

VITE_IS_DEVELPOMENT=
VITE_IS_MAINTAINENCE_MODE=
```

### 3. Running the Frontend

#### Development Mode

```bash
# Start Vite dev server
pnpm run dev
```

Application will be available at `http://localhost:5173`

#### Production Build

```bash
# Build for production
pnpm run build

# Preview production build
pnpm run serve
```

#### Build Output

The production build outputs to `dist/` directory.

---

## Running Both Services

### Option 1: Manual (Terminal Windows)

**Terminal 1 - Backend:**

```bash
cd backend
pnpm run dev
```

**Terminal 2 - Frontend:**

```bash
cd frontend
pnpm run dev
```

Both services will run concurrently:

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`

---
