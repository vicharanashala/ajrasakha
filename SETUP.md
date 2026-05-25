# AjraSakha Development Setup Guide

Complete setup instructions for the frontend and backend of the AjraSakha project.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Running Both Services](#running-both-services)
- [Backend Testing](#backend-testing)
- [Frontend Testing](#frontend-testing)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

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
cp .env.example .env
```

Edit `.env` and fill in the required values:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/ajrasakha
NODE_ENV=development

# Firebase (Authentication)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# API Configuration
API_PORT=3000
API_HOST=localhost

# Sentry (Error tracking)
SENTRY_DSN=your-sentry-dsn

# Email/SMTP Configuration
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-password

# Storage
STORAGE_BUCKET=your-storage-bucket

# OpenAI API
OPENAI_API_KEY=your-openai-key
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
pnpm run dev
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

Create a `.env` file (optional - frontend can work with defaults):

```bash
# Copy if .env.example exists
# cp .env.example .env
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

### Option 2: Using npm-run-all (Concurrent)

From the root directory:

```bash
# Install globally or use npx
pnpm install -g npm-run-all

# Run both dev servers
npm-run-all --parallel "cd backend && pnpm run dev" "cd frontend && pnpm run dev"
```

### Option 3: Docker Compose (if available)

```bash
docker-compose up
```

---

## Backend Testing

### Test Configuration

The backend uses **Vitest** as the testing framework with the following features:
- Unit and integration tests
- Coverage reporting with `@vitest/coverage-v8`
- UI mode for visual test debugging
- MongoDB Memory Server for isolated DB tests
- Supertest for HTTP endpoint testing

### Running Tests

#### Run All Tests (Watch Mode)

```bash
cd backend

# Run tests with watch mode
pnpm test:watch
```

#### Run Tests Once

```bash
cd backend

# Run all tests once
NODE_ENV=test pnpm test -- --run
```

#### Run Tests with UI

```bash
cd backend

# Open interactive test UI
pnpm test
```

Browse to `http://localhost:51204` to see the test UI.

#### Run Specific Test File

```bash
cd backend

# Run a specific test file
NODE_ENV=test pnpm test -- path/to/test.spec.ts
```

#### Coverage Report

```bash
cd backend

# Generate coverage report
NODE_ENV=test pnpm test:ci
```

Coverage report will be generated in `coverage/` directory.

### Test File Locations

Test files are typically located alongside source code or in a `tests/` directory:

```
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── __tests__/
│   │   │       └── auth.spec.ts
│   ├── shared/
│   │   └── __tests__/
│   │       └── shared.spec.ts
```

### Writing Tests

Example test structure:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../auth.service';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  afterEach(() => {
    // Cleanup
  });

  it('should authenticate user with valid credentials', async () => {
    const result = await authService.login('user@example.com', 'password');
    expect(result).toBeDefined();
    expect(result.token).toBeTruthy();
  });

  it('should throw error with invalid credentials', async () => {
    expect(async () => {
      await authService.login('user@example.com', 'wrong');
    }).rejects.toThrow();
  });
});
```

### Key Testing Libraries

| Library | Purpose |
|---------|---------|
| `vitest` | Test framework |
| `@vitest/ui` | Visual test interface |
| `@vitest/coverage-v8` | Coverage reporting |
| `supertest` | HTTP request testing |
| `mongodb-memory-server` | In-memory MongoDB for tests |
| `@faker-js/faker` | Test data generation |

---

## Frontend Testing

### Test Configuration

The frontend uses **Vitest** with:
- React Testing Library for component testing
- jsdom environment for DOM testing
- MSW (Mock Service Worker) for API mocking
- Vitest UI for visual debugging

### Running Tests

#### Run All Tests (Watch Mode)

```bash
cd frontend

# Run tests in watch mode
pnpm test
```

#### Run Tests with UI

```bash
cd frontend

# Open interactive test UI
pnpm test:ui
```

Browse to the URL provided (usually `http://localhost:51204`).

#### Run Tests Once

```bash
cd frontend

# Run all tests once
pnpm test -- --run
```

#### Run Specific Test File

```bash
cd frontend

# Run a specific test file
pnpm test -- src/components/Button.spec.tsx
```

### Test File Locations

Frontend test files are typically in `src/` or `src/__tests__/`:

```
frontend/
├── src/
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Button.spec.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Home.spec.tsx
│   ├── __tests__/
│   │   └── setup.ts
```

### Writing Tests

Example component test:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from '../Button';

describe('Button Component', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', async () => {
    const handleClick = vitest.fn();
    const user = userEvent.setup();
    
    render(<Button onClick={handleClick}>Click</Button>);
    await user.click(screen.getByText('Click'));
    
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

### Key Testing Libraries

| Library | Purpose |
|---------|---------|
| `vitest` | Test framework |
| `@testing-library/react` | Component testing utilities |
| `@testing-library/user-event` | User interaction simulation |
| `@testing-library/jest-dom` | DOM matchers |
| `jsdom` | DOM environment |
| `msw` | API mocking |
| `msw-auto-mock` | Auto-generate mock responses |
| `@faker-js/faker` | Test data generation |

---

## Project Structure

### Backend

```
backend/
├── src/
│   ├── bootstrap/          # Module initialization
│   ├── config/             # Configuration files
│   ├── container.ts        # Dependency injection setup
│   ├── index.ts            # Entry point
│   ├── modules/            # Feature modules
│   │   ├── auth/
│   │   ├── courses/
│   │   ├── quizzes/
│   │   ├── users/
│   │   └── ...
│   ├── shared/             # Shared utilities & middleware
│   └── utils/              # Helper functions
├── build/                  # Compiled JavaScript (generated)
├── .env.example            # Environment template
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
└── README.md               # Backend documentation
```

### Frontend

```
frontend/
├── src/
│   ├── components/         # Reusable components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom React hooks
│   ├── utils/              # Helper functions
│   ├── __tests__/          # Test setup files
│   ├── App.tsx             # Root component
│   └── main.tsx            # Entry point
├── public/                 # Static assets
├── dist/                   # Production build (generated)
├── .env.example            # Environment template
├── package.json            # Dependencies
├── vite.config.ts          # Vite configuration
└── README.md               # Frontend documentation
```

---

## Common Commands Reference

### Backend Commands

```bash
# Development
pnpm run dev              # Run with hot reload
pnpm run build            # Compile TypeScript
pnpm start                # Run compiled server

# Testing
pnpm test                 # Run tests with UI
pnpm test:watch           # Run tests in watch mode
pnpm test:ci              # Run tests with coverage

# Code Generation
pnpm generate             # Generate new module/service/controller using Plop

# Other
pnpm run sentry:sourcemaps  # Upload source maps to Sentry
```

### Frontend Commands

```bash
# Development
pnpm run dev              # Start dev server
pnpm run build            # Build for production
pnpm run serve            # Preview production build

# Testing
pnpm test                 # Run tests with UI
pnpm test:ui              # Open test UI dashboard

# API
pnpm run openapi-ts       # Generate API client from OpenAPI spec
```

---

## Troubleshooting

### Backend Issues

#### MongoDB Connection Error

**Problem**: `MongoError: connect ECONNREFUSED`

**Solution**:
```bash
# Check if MongoDB is running
mongo --version

# Start MongoDB locally
mongod

# Or use Docker
docker run -d -p 27017:27017 --name mongodb mongo
```

#### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9

# Or change port in .env
API_PORT=3001
```

#### Dependencies Installation Failed

**Problem**: `pnpm install` fails

**Solution**:
```bash
# Clear pnpm cache
pnpm store prune

# Reinstall
pnpm install --force
```

### Frontend Issues

#### Port Already in Use

**Problem**: `EADDRINUSE: address already in use :::5173`

**Solution**:
```bash
# Kill process using port 5173
lsof -ti:5173 | xargs kill -9

# Or specify different port
pnpm run dev -- --port 5174
```

#### Module Not Found Error

**Problem**: `Cannot find module '@/components/Button'`

**Solution**:
- Check `vite.config.ts` for alias configuration
- Verify path aliases in `tsconfig.json`

#### Build Fails

**Problem**: Build process errors

**Solution**:
```bash
# Clear node_modules
rm -rf node_modules
pnpm install

# Clear cache
pnpm store prune

# Rebuild
pnpm run build
```

### Testing Issues

#### Tests Timeout

**Problem**: `Test timeout exceeded`

**Solution**:
```bash
# Increase timeout in test file
it('should fetch data', { timeout: 10000 }, async () => {
  // test code
});
```

#### MongoDB Memory Server Not Working

**Problem**: `mongodb-memory-server download failed`

**Solution**:
```bash
# Ensure proper permissions
chmod 755 ~/.cache/mongodb-memory-server

# Reinstall
pnpm install --force
```

---

## Performance Tips

1. **Backend**
   - Use indexes on frequently queried MongoDB fields
   - Enable query optimization in `.env`
   - Monitor with Sentry in production

2. **Frontend**
   - Use React Query for efficient data fetching
   - Implement code splitting with Vite
   - Monitor with web-vitals

3. **Both**
   - Use environment-appropriate configurations
   - Implement proper error logging
   - Run tests before commits

---

## Additional Resources

- [Backend README](./backend/README.md)
- [Frontend Setup](./frontend/README.md) (if available)
- [Vitest Documentation](https://vitest.dev)
- [React Testing Library](https://testing-library.com/react)
- [MongoDB Documentation](https://docs.mongodb.com)
- [Vite Documentation](https://vitejs.dev)

---

## Support

For issues or questions:
1. Check this guide first
2. Review the Troubleshooting section
3. Check backend/frontend READMEs
4. Open an issue in the repository

---

**Last Updated**: May 25, 2026
**Tested On**: Node.js v18+, pnpm v10.4.1
