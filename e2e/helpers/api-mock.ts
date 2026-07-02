import { Page, Route } from '@playwright/test';

/**
 * API mock helpers for intercepting backend calls in tests.
 * Prefer these over arbitrary sleeps — they make tests fast and deterministic.
 */

// ── Firebase REST auth stub ───────────────────────────────────────────────────
/**
 * Mock the Firebase Auth REST endpoint so tests don't need a real Firebase project.
 * Call BEFORE navigating to the login page.
 */
export async function mockFirebaseLogin(
  page: Page,
  overrides: { uid?: string; email?: string; idToken?: string } = {}
): Promise<void> {
  const uid = overrides.uid ?? 'test-user-uid-001';
  const email = overrides.email ?? process.env.E2E_EMAIL ?? 'test@example.com';
  const idToken = overrides.idToken ?? 'fake-id-token-for-testing';

  // Firebase signInWithEmailAndPassword makes a POST to identitytoolkit
  await page.route('**/identitytoolkit.googleapis.com/**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'identitytoolkit#VerifyPasswordResponse',
        localId: uid,
        email,
        idToken,
        refreshToken: 'fake-refresh-token',
        expiresIn: '3600',
        registered: true,
      }),
    });
  });
}

// ── Current user (/api/users/me) ──────────────────────────────────────────────
export async function mockCurrentUser(
  page: Page,
  role: 'expert' | 'admin' | 'moderator' | 'call_agent' = 'expert',
  extra: Record<string, unknown> = {}
): Promise<void> {
  await page.route('**/api/users/me**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        _id: 'test-user-id-001',
        email: process.env.E2E_EMAIL ?? 'test@example.com',
        firstName: 'Test',
        lastName: 'Expert',
        role,
        avatar: '',
        notifications: 0,
        isCallAgentActive: false,
        ...extra,
      }),
    });
  });
}

// ── Questions list ────────────────────────────────────────────────────────────
export interface MockQuestion {
  id: string;
  text: string;
  source: 'AJRASAKHA' | 'WHATSAPP' | 'kcc_agent' | 'annam';
  language?: string;
  aiInitialAnswer?: string;
  history?: unknown[];
  timer?: string;
}

const DEFAULT_QUESTIONS: MockQuestion[] = [
  {
    id: 'q-english-001',
    text: 'What is the best fertilizer for wheat crop in winter season?',
    source: 'annam',
    language: 'en-IN',
    aiInitialAnswer: 'Use urea at 120 kg/ha and DAP at 100 kg/ha for best wheat yield.',
    history: [],
    timer: '02:30:00',
  },
  {
    id: 'q-hindi-001',
    text: 'गेहूं की फसल में कौन सी खाद सबसे अच्छी है?',
    source: 'AJRASAKHA',
    language: 'hi-IN',
    aiInitialAnswer: 'गेहूं की फसल के लिए यूरिया 120 किग्रा/हेक्टेयर और DAP 100 किग्रा/हेक्टेयर उपयोगी है।',
    history: [],
    timer: '01:45:00',
  },
];

export async function mockQuestionList(
  page: Page,
  questions: MockQuestion[] = DEFAULT_QUESTIONS
): Promise<void> {
  await page.route('**/api/questions/allocated**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(questions),
    });
  });
}

export async function mockQuestionById(
  page: Page,
  question: MockQuestion
): Promise<void> {
  await page.route(`**/api/questions/${question.id}**`, (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...question,
        aiApprovedAnswer: null,
        aiApprovedSources: [],
        details: {},
      }),
    });
  });
}

// ── Sarvam translate API ──────────────────────────────────────────────────────
export async function mockSarvamTranslate(
  page: Page,
  translatedText = '[Translated text]'
): Promise<void> {
  // The app calls the backend proxy which calls Sarvam
  await page.route('**/api/translate**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ translatedText }),
    });
  });

  // Also intercept direct Sarvam calls if they go out
  await page.route('**sarvam.ai**/translate**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ translated_text: translatedText }),
    });
  });
}

// ── Submit answer (POST /api/answers) ────────────────────────────────────────
export async function mockSubmitAnswer(page: Page): Promise<void> {
  await page.route('**/api/answers**', (route: Route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Answer submitted' }),
      });
    } else {
      route.continue();
    }
  });
}

// ── 500 server error ──────────────────────────────────────────────────────────
export async function mockServerError(page: Page, urlPattern = '**/api/**'): Promise<void> {
  await page.route(urlPattern, (route: Route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Internal Server Error' }),
    });
  });
}

// ── Network offline simulation ────────────────────────────────────────────────
export async function simulateNetworkOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

export async function restoreNetwork(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

// ── Audio chunk upload ─────────────────────────────────────────────────────────
export async function mockAudioUpload(
  page: Page,
  transcript = 'मेरी फसल में कीट लग गए हैं'
): Promise<void> {
  await page.route('**/api/contexts/audio**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ transcript }),
    });
  });
}

// ── Submit transcript ─────────────────────────────────────────────────────────
export async function mockSubmitTranscript(page: Page): Promise<void> {
  await page.route('**/api/contexts**', (route: Route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });
}
