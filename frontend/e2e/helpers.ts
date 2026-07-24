import { Page } from "@playwright/test";

export interface MockUser {
  uid: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Pre-authenticates the browser tab by injecting the mock auth store state into localStorage
 * before the page renders, bypassing Firebase Authentication logic.
 */
export async function loginAs(page: Page, user: MockUser) {
  await page.addInitScript((userData) => {
    const authStoreState = {
      state: {
        user: {
          uid: userData.uid,
          email: userData.email,
          name: userData.name,
          avatar: "",
        },
        firebaseUser: {
          uid: userData.uid,
          email: userData.email,
          displayName: userData.name,
          emailVerified: true,
        },
        isAuthenticated: true,
        loading: false,
        error: null,
      },
      version: 0,
    };

    window.localStorage.setItem("auth-storage", JSON.stringify(authStoreState));
    window.localStorage.setItem("firebase-auth-token", "mock-auth-token");
    window.localStorage.setItem("user-id", userData.uid);
    window.localStorage.setItem("user-email", userData.email);
  }, user);
}
