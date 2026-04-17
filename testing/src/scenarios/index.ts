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
    6. The 'Allocated Questions' view should be open. If the first question is ALREADY displayed on the right panel ('Draft Response' is visible), move directly to the next step. Otherwise, click the question card on the left to open it.
    7. Now, meticulously fill out the Expert Response Panel on the right. 
    8. First, find the 'Draft Response' text area (placeholder: "Enter your answer here...") and type a detailed gardening solution.
    9. Next, find the 'Remarks' text area (placeholder: "Enter remarks...") and type "Looks like a standard fungal infection."
    10. Next, navigate to the 'Source References' section. Click the 'Select Source Type' dropdown (use strictly selector: "text=Select Source Type"). Then, from the popup menu, select "Central" (use strictly selector: "text=Central").
    11. Wait a moment for dynamic input fields to appear. Then fill the 'Source Name' input, the 'Source Link URL' input, and the 'Page' number input with dummy data.
    12. EXTREMELY IMPORTANT: Do NOT skip this step! You MUST explicitly generate a 'click' action for the small green Add icon to save the reference to the list. Use strictly the CSS selector: "#add-source-button"
    13. Wait 1000ms. Then, click the green Submit button (use strictly selector: ".bg-primary:has-text('Submit'), button[type='submit']") to push the answer.
    14. A 'Submit Response' confirmation modal will pop up on the screen. Wait 1000ms, then click the green "Submit Response" button inside the modal to finally save it (use strictly selector: "text=Submit Response").
    15. EXTREMELY IMPORTANT: You MUST now bypass the peer-review requirements for the test database. Issue exactly this action type: {"type":"escalate_db","description":"Bypass peer review in DB"}.
    16. You must now Log out. First, click the top-right profile avatar (use strictly selector: "#user-profile-menu"). Then, click the Logout option (use strictly selector: "#logout-button").
    17. You should now be logged out. Verify you are at or navigate back to http://localhost:5173/auth.
    18. Now log in as the moderator: Fill email with "ashif.mod@gmail.com" and password with "Ashifmod", then click "Sign In".
    19. Wait 6000ms for the dashboard to load.
    20. Open the review queue, find the answer you just submitted, and click 'Approve'.
    21. Verify the question status is closed.
    22. Take a screenshot named "e2e-qa-success.png".
    If any action fails or a button is missing, return 'fail'.`,
  },
];
