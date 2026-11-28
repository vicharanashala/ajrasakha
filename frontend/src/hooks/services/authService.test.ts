import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({ env: { apiBaseUrl: () => "http://api.test" } }));

import { AuthService } from "./authService";

const authService = new AuthService();

// Returns the URL and options of the first fetch call.
const firstFetchCall = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls[0] as unknown as [string, RequestInit];

describe("AuthService backend login calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the credentials to /auth/login and returns the backend payload", async () => {
    const payload = { idToken: "t", expiresIn: "3600", localId: "local_1", email: "a@test.com", displayName: "A", user: {} };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(authService.localLogin("a@test.com", "Str0ng!Passw0rd")).resolves.toEqual(payload);

    const [url, options] = firstFetchCall(fetchMock);
    expect(url).toBe("http://api.test/auth/login");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({ email: "a@test.com", password: "Str0ng!Passw0rd" });
  });

  it("throws the backend's error message so the login form can show it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Too many failed login attempts. Please try again in 15 minutes." }), { status: 429 }))
    );

    await expect(authService.localLogin("a@test.com", "x")).rejects.toThrow("Too many failed login attempts");
  });

  it("falls back to a generic message when the error body is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));

    await expect(authService.localLogin("a@test.com", "x")).rejects.toThrow("Invalid Credentials");
  });

  it("changes the password with the bearer token and both password fields", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, message: "ok", idToken: "new" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await authService.changePassword("session-token", "Old!Passw0rd", "N3w!Passw0rd");

    const [url, options] = firstFetchCall(fetchMock);
    expect(url).toBe("http://api.test/auth/change-password");
    expect(options.method).toBe("PATCH");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
    expect(JSON.parse(options.body as string)).toEqual({
      currentPassword: "Old!Passw0rd",
      newPassword: "N3w!Passw0rd",
      newPasswordConfirm: "N3w!Passw0rd",
    });
  });
});

describe("AuthService reset password with code", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const payload = {
    email: "a@test.com",
    otp: "123456",
    newPassword: "N3w!Passw0rd",
    newPasswordConfirm: "N3w!Passw0rd",
  };

  it("posts the code and new password to /auth/reset-password", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, message: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(authService.resetPasswordWithCode(payload)).resolves.toEqual({ success: true, message: "ok" });

    const [url, options] = firstFetchCall(fetchMock);
    expect(url).toBe("http://api.test/auth/reset-password");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual(payload);
  });

  it("surfaces the backend message for an invalid or expired code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "Invalid or expired reset code" }), { status: 400 }))
    );

    await expect(authService.resetPasswordWithCode(payload)).rejects.toThrow("Invalid or expired reset code");
  });
});
