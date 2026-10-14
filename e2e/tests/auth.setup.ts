import { test as setup, expect } from "@playwright/test";
import { env } from "../support/config";
import { login, expectLoggedIn } from "../support/helpers";
import { snapshotFirebaseSession } from "../support/idb-session";

// Local mode: the Firebase Auth Emulator (single process) handles UI sign-ins
// one at a time reliably; concurrent sign-ins race and bounce back to /auth.
// Serialize the 3 setup sign-ins locally. Staging runs stay parallel.
if (env.localMode) {
  setup.describe.configure({ mode: "serial" });
}

/**
 * Signs each role in through the real UI and snapshots the session
 * (Firebase localStorage persistence + app storage) to `.auth/<role>.json`.
 * These files are gitignored and consumed via storageState by the role projects.
 */
const roles = [
  { name: "admin", credentials: env.admin, path: ".auth/admin.json", tab: "Dashboard" },
  { name: "moderator", credentials: env.moderator, path: ".auth/moderator.json", tab: "Dashboard" },
  { name: "expert", credentials: env.expert, path: ".auth/expert.json", tab: "My Queue" },
] as const;

for (const role of roles) {
  setup(`${role.name} sign-in`, async ({ page }) => {
    await login(page, role.credentials);
    await expectLoggedIn(page);

    // Persist the session (localStorage + cookies) for the role project.
    await page.context().storageState({ path: role.path });

    // Prove the session survived a hard reload.
    await page.reload();
    await expectLoggedIn(page);
    expect(page.url()).not.toContain("/auth");

    // The Firebase SDK keeps the actual session in IndexedDB, which storageState
    // does not capture. Snapshot it so role contexts can restore it locally.
    await snapshotFirebaseSession(page, role.name);
  });
}
