// src/scenarios/index.ts
// All test scenarios for Ajrasakha — written in plain English

import { TestScenario } from "../agent/runner";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MODERATOR_EMAIL = process.env.MODERATOR_EMAIL ?? "";
const MODERATOR_PASSWORD = process.env.MODERATOR_PASSWORD ?? "";
const EXPERT_EMAIL = process.env.EXPERT_EMAIL ?? "";
const EXPERT_PASSWORD = process.env.EXPERT_PASSWORD ?? "";

export const scenarios: TestScenario[] = [
  // ── AUTH ────────────────────────────────────────────────────────────────────
  {
    name: "Login as Expert",
    goal: `Go to ${FRONTEND_URL}/auth. 
    Login with email "${EXPERT_EMAIL}" and password "${EXPERT_PASSWORD}". 
    Verify you are redirected to the home/dashboard page after login. 
    Take a screenshot named "login-expert-success.png".`,
  },

  {
    name: "Login with wrong password",
    goal: `Go to ${FRONTEND_URL}/auth. 
    Try to login with email "${EXPERT_EMAIL}" and password "WrongPassword123!". 
    Verify that an error message appears indicating incorrect credentials. 
    Take a screenshot named "login-fail.png".`,
  },

  {
    name: "Login as Moderator",
    goal: `Go to ${FRONTEND_URL}/auth. 
    Login with email "${MODERATOR_EMAIL}" and password "${MODERATOR_PASSWORD}". 
    Verify you land on the dashboard. 
    Take a screenshot named "login-moderator-success.png".`,
  },

  // ── EXPERT WORKFLOW ─────────────────────────────────────────────────────────
  {
    name: "Expert views allocated questions",
    goal: `Go to ${FRONTEND_URL}/auth and login as expert with email "${EXPERT_EMAIL}" and password "${EXPERT_PASSWORD}". 
    After login, navigate to the home page. 
    Look for a list of questions allocated to the expert. 
    Take a screenshot named "expert-question-list.png". 
    Verify that the questions list is visible or that a message like "no questions" appears if empty.`,
  },

  // ── NOTIFICATIONS ────────────────────────────────────────────────────────────
  {
    name: "Notifications page loads",
    goal: `Go to ${FRONTEND_URL}/auth and login as expert with email "${EXPERT_EMAIL}" and password "${EXPERT_PASSWORD}". 
    After login, navigate to ${FRONTEND_URL}/notifications. 
    Verify the notification page loads without errors. 
    Take a screenshot named "notifications-page.png".`,
  },

  // ── PROFILE ─────────────────────────────────────────────────────────────────
  {
    name: "Profile page loads and shows user info",
    goal: `Go to ${FRONTEND_URL}/auth and login as expert with email "${EXPERT_EMAIL}" and password "${EXPERT_PASSWORD}". 
    After login, navigate to ${FRONTEND_URL}/profile. 
    Verify the profile page loads and shows user information (name or email). 
    Take a screenshot named "profile-page.png".`,
  },

  // ── PERMISSION GUARD ─────────────────────────────────────────────────────────
  {
    name: "Unauthenticated user is redirected to login",
    goal: `Without logging in, go directly to ${FRONTEND_URL}/home. 
    Verify that you are redirected to the auth/login page instead of seeing the home page. 
    Take a screenshot named "redirect-to-login.png".`,
  },

  // ── END TO END PIPELINE ──────────────────────────────────────────────────────
  {
    name: "Full Q&A Lifecycle: Expert answers, Moderator approves",
    goal: `Execute the complete end-to-end Q&A workflow exactly as follows:
    1. Navigate to ${FRONTEND_URL}/auth.
    2. Fill the email input (use selector: input[name="email"]) with "${EXPERT_EMAIL}".
    3. Fill the password input (use selector: input[name="password"]) with "${EXPERT_PASSWORD}".
    4. Click the blue 'Sign In' button (use selector: button[type="submit"]).
    5. Wait exactly 6000ms for the dashboard to completely load.
    6. Click on the 'Allocated Questions' tab/link.
    7. Find the first question on the screen and click it to open the answer interface.
    8. Click on the text area for the answer and draft a response indicating a solution.
    9. Click the Submit button to submit the expert answer (use strictly selector: "text=Submit").
    10. Log out by clicking your profile icon (use selector: ".text-white" or similar avatar) and clicking "Logout".
    11. Navigate back to ${FRONTEND_URL}/auth.
    12. Now log in as the moderator: Fill email with "${MODERATOR_EMAIL}" and password with "${MODERATOR_PASSWORD}", then submit.
    13. Wait 6000ms for the dashboard to load.
    14. Open the review queue, find the answer you just submitted, and click 'Approve'.
    15. Verify the question status is closed.
    16. Take a screenshot named "e2e-qa-success.png".
    If any action fails or a button is missing, return 'fail'.`,
  },
];
