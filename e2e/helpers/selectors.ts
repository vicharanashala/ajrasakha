/**
 * Centralized selector constants for the Ajrasakha reviewer platform.
 * Update here when the UI changes — tests reference these instead of raw strings.
 */

export const Selectors = {
  // ── Auth ──────────────────────────────────────────────────
  auth: {
    emailInput: 'input#email',
    passwordInput: 'input#password',
    submitButton: '[data-testid="auth-submit-button"]',
    emailLabel: 'label[for="email"]',
    passwordLabel: 'label[for="password"]',
    forgotPasswordLink: 'button:has-text("Forgot password?")',
    signupToggle: 'button:has-text("Sign up")',
    loginToggle: 'button:has-text("Sign in")',
    nameInput: 'input#name',
    confirmPasswordInput: 'input#confirmPassword',
    backToLoginButton: 'button:has-text("Back to Login")',
    resetLinkButton: 'button:has-text("Send Reset Link")',
    forgotEmailInput: 'input#forgot-email',
  },

  // ── Navigation ────────────────────────────────────────────
  nav: {
    allQuestionsTab: '[role="tab"]:has-text("All Questions")',
    agentsInterfaceTab: '[role="tab"]:has-text("Agents Interface")',
    myQueueTab: '[role="tab"]:has-text("My Queue")',
    dashboardTab: '[role="tab"]:has-text("Dashboard")',
    mobileSidebarToggle: 'button[aria-label*="menu"], button[aria-label*="sidebar"]',
  },

  // ── QA Interface ──────────────────────────────────────────
  qa: {
    answerTextarea: 'textarea#new-answer',
    remarksTextarea: 'textarea#remarks',
    submitButton: 'button:has-text("Submit")',
    resetButton: 'button:has-text("Reset"), button[title="Reset"]',
    questionList: '[data-testid="question-list"], .question-list',
    timerDisplay: '[data-testid="timer-display"]',
    translateDropdown: '[data-testid="translate-dropdown"]',
    translateTrigger: '[data-testid="translate-trigger"]',
    translateMenu: '[data-testid="translate-menu"]',
    aiAnswerBadge: 'text=AI Suggested Answer',
    responseCard: 'text=Response',
    currentQueryLabel: 'text=Current Query:',
  },

  // ── Voice Recorder ────────────────────────────────────────
  voice: {
    toggleButton: '[data-testid="voice-toggle-btn"]',
    transcript: '[data-testid="voice-transcript"]',
    submitButton: '[data-testid="voice-submit-btn"]',
    clearButton: '[data-testid="voice-clear-btn"]',
    languageSelect: '.select-trigger, [role="combobox"]',
    transcriptPlaceholder: 'text=Your speech will appear here',
    startCueText: 'text=Click microphone to start',
  },

  // ── Toast notifications ───────────────────────────────────
  toast: {
    container: '[role="status"], [aria-live="polite"]',
    error: '.toast-error, [data-type="error"]',
    success: '.toast-success, [data-type="success"]',
  },
} as const;
