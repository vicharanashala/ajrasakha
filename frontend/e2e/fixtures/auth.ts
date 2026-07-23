import { Page } from "@playwright/test";

export const mockUsers = {
  admin: {
    _id: "664f000000000000000000001",
    firebaseUID: "firebase-admin-uid",
    email: "admin@annam.ai",
    firstName: "Test",
    lastName: "Admin",
    role: "admin",
    isBlocked: false,
    status: "active",
    isCallAgent: false,
    isCallAgentActive: false,
    notifications: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  moderator: {
    _id: "664f000000000000000000002",
    firebaseUID: "firebase-moderator-uid",
    email: "moderator@annam.ai",
    firstName: "Test",
    lastName: "Moderator",
    role: "moderator",
    isBlocked: false,
    status: "active",
    isCallAgent: false,
    isCallAgentActive: false,
    notifications: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  expert: {
    _id: "664f000000000000000000003",
    firebaseUID: "firebase-expert-uid",
    email: "expert@annam.ai",
    firstName: "Test",
    lastName: "Expert",
    role: "expert",
    isBlocked: false,
    status: "active",
    isCallAgent: false,
    isCallAgentActive: false,
    notifications: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  callAgent: {
    _id: "664f000000000000000000004",
    firebaseUID: "firebase-callagent-uid",
    email: "callagent@annam.ai",
    firstName: "Test",
    lastName: "CallAgent",
    role: "call_agent",
    isBlocked: false,
    status: "active",
    isCallAgent: true,
    isCallAgentActive: true,
    notifications: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  paeExpert: {
    _id: "664f000000000000000000005",
    firebaseUID: "firebase-pae-expert-uid",
    email: "pae.expert@annam.ai",
    firstName: "Test",
    lastName: "PAEExpert",
    role: "pae_expert",
    isBlocked: false,
    status: "active",
    isCallAgent: false,
    isCallAgentActive: false,
    notifications: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
  coordinator: {
    _id: "664f000000000000000000006",
    firebaseUID: "firebase-coordinator-uid",
    email: "coordinator@annam.ai",
    firstName: "Test",
    lastName: "Coordinator",
    role: "district_coordinator",
    isBlocked: false,
    status: "active",
    isCallAgent: false,
    isCallAgentActive: false,
    notifications: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  },
};

export async function setupAuth(
  page: Page,
  user: any,
): Promise<void> {
  // 1. Pre-seed Zustand persisted auth store so route guards see an authenticated user
  await page.addInitScript((u) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({
        state: {
          user: {
            uid: u.firebaseUID,
            email: u.email,
            name: `${u.firstName} ${u.lastName}`,
            avatar: "",
          },
          isAuthenticated: true,
          loading: false,
          error: null,
          firebaseUser: null,
        },
        version: 0,
      })
    );
  }, user);

  // 2. Prevent initAuthListener (routes/index.tsx) from overwriting the seeded Zustand user
  //    via onAuthStateChanged. The Zustand store is already seeded by addInitScript — so
  //    letting initAuthListener run would only race against and override that deterministic state.
  await page.route("**/src/routes/index.tsx*", async (route) => {
    const resp = await route.fetch();
    const body = await resp.text();
    await route.fulfill({
      body: body.replace(
        /initAuthListener\s*\(\s*\)/,
        "/* initAuthListener disabled in test */"
      ),
      contentType: "application/javascript",
    });
  });

  // 4. Intercept all Firebase SDK requests so they don't hang during init
  await page.route("**/identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/securetoken.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/firebase.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.route("**/firebaseinstallations.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );

  // 4. Mock /api/users/me so useGetCurrentUser resolves with the given user
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });

  // 5. Mock /api/analytics/user-profile so the /user/$userId route guard
  //    receives a profile with a matching email and doesn't redirect back to /home.
  await page.route("**/api/analytics/user-profile*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ userId: user._id, email: user.email }),
    });
  });
}
