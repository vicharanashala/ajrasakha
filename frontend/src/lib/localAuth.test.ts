import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  localLogin: vi.fn(),
  changePassword: vi.fn(),
  resendVerification: vi.fn(),
  accountSync: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  getAnalytics: vi.fn(),
  clearQueryCache: vi.fn(),
}));

// Firebase login disabled: no Firebase app or auth instance exists.
vi.mock("@/config/firebase", () => ({
  auth: null,
  firebaseApp: null,
  googleProvider: {},
  isFirebaseLoginEnabled: false,
}));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signOut: mocks.signOut,
  onAuthStateChanged: mocks.onAuthStateChanged,
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
  signInWithPopup: vi.fn(),
  getIdToken: vi.fn(),
}));
vi.mock("firebase/analytics", () => ({ getAnalytics: mocks.getAnalytics }));
vi.mock("@/routes/__root", () => ({ queryClient: { clear: mocks.clearQueryCache } }));
vi.mock("@/hooks/services/userService", () => ({
  UserService: class {
    Getuser = mocks.getUser;
  },
}));
vi.mock("@/hooks/services/authService", () => ({
  AuthService: class {
    localLogin = mocks.localLogin;
    changePassword = mocks.changePassword;
    resendVerification = mocks.resendVerification;
    accountSync = mocks.accountSync;
  },
}));

import { analytics, changePasswordWithBackend, loginWithEmail } from "@/lib/firebase";
import { apiFetch, getAuthToken } from "@/hooks/api/api-fetch";
import { getLocalAuthToken, setLocalAuthToken } from "@/lib/localAuthToken";
import { useAuthStore } from "@/stores/auth-store";

const PASSWORD = "Str0ng!Passw0rd";
const backendLogin = {
  idToken: "backend-token",
  expiresIn: "3600",
  localId: "local_123",
  email: "user@test.com",
  displayName: "Test User",
  user: { _id: "user-1", email: "user@test.com", role: "pae_expert", firstName: "Test" },
};

describe("frontend auth with VITE_ENABLE_FIREBASE_LOGIN=false", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    useAuthStore.setState({ user: null, firebaseUser: null, isAuthenticated: false, loading: false });
  });

  it("does not start Firebase Analytics", () => {
    expect(analytics).toBeNull();
    expect(mocks.getAnalytics).not.toHaveBeenCalled();
  });

  describe("loginWithEmail", () => {
    it("logs in through the backend, stores its token and never calls Firebase", async () => {
      mocks.getUser.mockResolvedValue({ role: "pae_expert", isBlocked: false });
      mocks.localLogin.mockResolvedValue(backendLogin);

      const result = await loginWithEmail("user@test.com", PASSWORD);

      expect(mocks.localLogin).toHaveBeenCalledWith("user@test.com", PASSWORD);
      expect(getLocalAuthToken()).toBe("backend-token");
      expect(result?.user.uid).toBe("local_123");
      expect(result?.user.email).toBe("user@test.com");
      expect(result?.appUser?._id).toBe("user-1");
      expect(mocks.signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it("refuses inactive accounts before sending the password anywhere", async () => {
      mocks.getUser.mockResolvedValue({ role: "expert", status: "in-active" });

      await expect(loginWithEmail("user@test.com", PASSWORD)).rejects.toThrow(
        "User marked as Inactive Please Contact Moderator"
      );
      expect(mocks.localLogin).not.toHaveBeenCalled();
      expect(getLocalAuthToken()).toBeNull();
    });

    it("still logs in through the backend when the account pre-check request fails", async () => {
      mocks.getUser.mockRejectedValue(new Error("Request failed with status 500"));
      mocks.localLogin.mockResolvedValue(backendLogin);

      await loginWithEmail("user@test.com", PASSWORD);

      expect(mocks.localLogin).toHaveBeenCalledTimes(1);
      expect(getLocalAuthToken()).toBe("backend-token");
      expect(mocks.signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it("surfaces the backend error and stores no token when credentials are wrong", async () => {
      mocks.getUser.mockResolvedValue(null);
      mocks.localLogin.mockRejectedValue(new Error("Invalid email or password"));

      await expect(loginWithEmail("user@test.com", "Wr0ng!Password")).rejects.toThrow(
        "Invalid email or password"
      );
      expect(getLocalAuthToken()).toBeNull();
    });
  });

  describe("API requests", () => {
    it("returns the stored backend token, or null when logged out", async () => {
      await expect(getAuthToken()).resolves.toBeNull();
      setLocalAuthToken("stored-token");
      await expect(getAuthToken()).resolves.toBe("stored-token");
    });

    it("sends the backend token as a bearer token", async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      setLocalAuthToken("stored-token");

      await apiFetch("http://api.test/resource");

      const [, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect((options.headers as Record<string, string>).Authorization).toBe("Bearer stored-token");
    });

    it("drops the token and user when the backend answers 401", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
      // jsdom does not implement navigation; the redirect itself is not under test here.
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      setLocalAuthToken("expired-token");
      useAuthStore.setState({ user: { uid: "local_123", email: "user@test.com", name: "Test", avatar: "" }, isAuthenticated: true });

      await expect(apiFetch("http://api.test/resource")).resolves.toBeNull();

      expect(getLocalAuthToken()).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe("session state", () => {
    const persistedUser = { uid: "local_123", email: "user@test.com", name: "Test", avatar: "" };

    it("keeps the persisted user while a backend token exists, without Firebase listeners", () => {
      setLocalAuthToken("stored-token");
      useAuthStore.setState({ user: persistedUser });

      useAuthStore.getState().initAuthListener();

      expect(useAuthStore.getState().user).toEqual(persistedUser);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(mocks.onAuthStateChanged).not.toHaveBeenCalled();
    });

    it("logs the user out on start-up when no token is stored", () => {
      useAuthStore.setState({ user: persistedUser, isAuthenticated: true });

      useAuthStore.getState().initAuthListener();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("removes the token on logout without calling Firebase", async () => {
      setLocalAuthToken("stored-token");
      useAuthStore.setState({ user: persistedUser });

      await useAuthStore.getState().logout();

      expect(getLocalAuthToken()).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(mocks.clearQueryCache).toHaveBeenCalled();
      expect(mocks.signOut).not.toHaveBeenCalled();
    });
  });

  describe("changePasswordWithBackend", () => {
    it("requires a logged-in user", async () => {
      await expect(changePasswordWithBackend(PASSWORD, "N3w!Passw0rd")).rejects.toThrow("User not logged in");
    });

    it("replaces the stored token with the one issued after the change", async () => {
      setLocalAuthToken("old-token");
      mocks.changePassword.mockResolvedValue({ success: true, message: "ok", idToken: "new-token" });

      const result = await changePasswordWithBackend(PASSWORD, "N3w!Passw0rd");

      expect(mocks.changePassword).toHaveBeenCalledWith("old-token", PASSWORD, "N3w!Passw0rd");
      expect(result.success).toBe(true);
      expect(getLocalAuthToken()).toBe("new-token");
    });

    it("flags an incorrect current password and keeps the session", async () => {
      setLocalAuthToken("old-token");
      mocks.changePassword.mockRejectedValue(new Error("Incorrect current password"));

      const result = await changePasswordWithBackend("Wr0ng!Password", "N3w!Passw0rd");

      expect(result).toEqual({
        success: false,
        incorrectCurrentPassword: true,
        errorMessage: "Incorrect current password",
      });
      expect(getLocalAuthToken()).toBe("old-token");
    });

    it("passes the backend's password-policy message through", async () => {
      setLocalAuthToken("old-token");
      mocks.changePassword.mockRejectedValue(new Error("Password must contain at least one number"));

      const result = await changePasswordWithBackend(PASSWORD, "NoNumbers!!");

      expect(result.incorrectCurrentPassword).toBe(false);
      expect(result.errorMessage).toBe("Password must contain at least one number");
    });
  });
});
