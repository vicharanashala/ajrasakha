# AjraSakha – Project 2: Web Application Testing

## Project Overview

AjraSakha Project 2 focuses on automated end-to-end and backend API testing using Playwright, TypeScript, Node.js, Express and MongoDB.

The project covers website testing, multilingual question and answer handling, database operations, disclaimer logic and automated test execution through GitHub Actions.

## Technologies Used

- Playwright – automated testing
- TypeScript – test development
- Node.js – JavaScript runtime
- Express.js – backend API
- MongoDB – database
- Mongoose – database models and operations
- GitHub Actions – CI automation

## Project Structure

```text
project-2-web-app-testing/
│
├── config/
│   └── db.ts
│
├── models/
│   └── model.ts
│
├── services/
│   └── disclaimerService.ts
│
├── tests/
│   └── Playwright test files
│
├── server.ts
├── seed.ts
├── playwright.config.ts
├── package.json
├── package-lock.json
└── .env
```

The exact test-file names and any additional folders may vary according to the final repository structure.

## Part 1: Website End-to-End Testing

Automated website testing was implemented using Playwright.

### Testing coverage

- Website accessibility and navigation
- Query submission
- English and Hindi query handling
- Language-related scenarios
- Voice input scenarios
- Mobile-related scenarios
- Empty query handling
- Network and server error scenarios
- Mid-session language switching

**Results confirmed locally:**
- 40 website E2E test cases
- 200 browser-specific test executions passed

## Part 2: MongoDB and API Testing

A separate backend testing setup was developed using Express, MongoDB and Mongoose.

### Database models

**IQuestion**
- Stores the question text.
- Stores the selected language.
- Maintains timestamps.

**IAnswer**
- Stores the associated question ID.
- Stores the answer text.
- Stores the answer language.
- Tracks whether a disclaimer was shown.
- Maintains timestamps.

### API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/questions` | Create a question |
| POST | `/api/answers` | Create an answer |
| GET | `/api/answers/:questionId` | Retrieve answers for a question |

### API testing coverage

A total of 46 API and functional tests passed locally.

The tests cover:
- Question creation in multiple languages
- Question validation
- Answer creation and question association
- Answer validation
- Retrieval and missing-question scenarios
- Language and disclaimer status
- Two-hour disclaimer service logic

The six disclaimer service tests directly test the service functions rather than an HTTP disclaimer endpoint.

### Multilingual handling

Question and answer scenarios cover:
- English
- Hindi
- Marathi
- Bengali
- Tamil
- Telugu

Disclaimer scenarios specifically cover Hindi and English.

### Two-hour disclaimer logic

The disclaimer service checks the time elapsed since the question was created.

It tests:
- Before two hours
- Exactly two hours
- After two hours
- Future question timestamps
- Hindi disclaimer
- English disclaimer

## Running the Project Locally

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure environment variables

Create a `.env` file and add your MongoDB connection string:

```env
MONGODB_URI=your_mongodb_connection_string
```

Do not commit `.env` or expose database credentials.

### 3. Start the backend

```bash
npx tsx server.ts
```

The backend runs on port `3001`.

### 4. Run all configured Playwright tests

```bash
npx playwright test
```

### 5. Run API tests

```bash
npx playwright test --project=API
```

### 6. Open the HTML report

```bash
npx playwright show-report
```

## GitHub Actions Integration

GitHub Actions is configured to automate testing when code is pushed or a pull request is created.

The workflow:
1. Checks out the repository.
2. Sets up Node.js.
3. Installs dependencies.
4. Starts a temporary MongoDB service.
5. Starts the backend server.
6. Checks backend availability.
7. Executes Playwright tests.
8. Uploads the HTML report.

The CI workflow uses a temporary MongoDB service instead of requiring access to the local MongoDB Atlas cluster.

## Test Execution Results

| Testing activity | Result |
|---|---:|
| Website E2E test cases | 40 |
| Local browser executions | 200 passed |
| Local API tests | 46 passed |
| Latest GitHub Actions execution | 256 passed |
| CI failures | 0 |

The exact browser/API breakdown of the 256 CI executions is pending final verification from the HTML report.

## Security

- Database credentials are stored in environment variables.
- `.env` should not be committed.
- GitHub Actions uses a temporary MongoDB service for CI testing.

## Conclusion

AjraSakha Project 2 establishes an automated testing setup for website and backend functionality using Playwright and TypeScript. MongoDB models, API endpoints, multilingual scenarios, disclaimer service tests and GitHub Actions automation have been implemented and tested.

The successful CI run completed 256 test executions with no failures.