import { env } from "@/config/env";
import type { ExtendedUserCredential, IUser } from "@/types";

/** Response of POST /auth/login when the backend checks the password against MongoDB. */
export interface LocalLoginResponse {
  idToken: string;
  expiresIn: string;
  localId: string;
  email: string;
  displayName: string;
  user: IUser;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
  idToken?: string;
}

// Extracts the backend's error message from a failed response, falling back to the status text.
const readErrorMessage = async (res: Response, fallback: string): Promise<string> => {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data?.message || fallback;
  } catch {
    return text || fallback;
  }
};

const API_BASE_URL = env.apiBaseUrl();

export class AuthService {
  private _baseUrl = `${API_BASE_URL}/auth`;

  async loginWithGoogle(firebaseLoginRes: ExtendedUserCredential) {
    try {
      const idToken = await firebaseLoginRes.user.getIdToken();

      const backendUrl = `${this._baseUrl}/signup/google/`;
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: firebaseLoginRes.user.email,
          firstName: firebaseLoginRes._tokenResponse?.firstName,
          lastName: firebaseLoginRes._tokenResponse?.lastName,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Login failed: ${res.status} ${res.statusText} - ${errorText}`
        );
      }
    } catch (error) {
      console.error("Login with google failed!", error);
      throw error;
    }
  }
  async signup({
    email,
    password,
    firstName,
    lastName,
  }: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    try {
      const backendUrl = `${this._baseUrl}/signup`;
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Signup failed: ${res.status} ${res.statusText} - ${errorText}`
        );
      }

      return res.json();
    } catch (error) {
      console.error("Signup failed!", error);
      throw error;
    }
  }

  // Logs in with email and password checked by the backend (used when Firebase login is disabled).
  async localLogin(email: string, password: string): Promise<LocalLoginResponse> {
    const res = await fetch(`${this._baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Invalid Credentials"));
    }
    return res.json();
  }

  // Changes the password through the backend, which verifies the current password (local login only).
  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string
  ): Promise<ChangePasswordResponse> {
    const res = await fetch(`${this._baseUrl}/change-password`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
        newPasswordConfirm: newPassword,
      }),
    });
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to update password"));
    }
    return res.json();
  }

  async accountSync(idToken: string) {
    try {
      const backendUrl = `${this._baseUrl}/sync`;
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Sync failed: ${res.status} ${res.statusText} - ${errorText}`
        );
      }

      return res.json();
    } catch (error) {
      console.error("Account sync failed!", error);
      throw error;
    }
  }

  async resendVerification(email: string) {
    try {
      const backendUrl = `${this._baseUrl}/resend-verification`;
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to resend verification: ${res.status} ${res.statusText} - ${errorText}`
        );
      }

      return res.json();
    } catch (error) {
      console.error("Resend verification failed!", error);
      throw error;
    }
  }

  async forgotPassword(email: string) {
    try {
      const backendUrl = `${this._baseUrl}/forgot-password`;
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to send reset email: ${res.status} ${res.statusText} - ${errorText}`
        );
      }

      return res.json();
    } catch (error) {
      console.error("Forgot password failed!", error);
      throw error;
    }
  }

  // Sets a new password using the code emailed by forgotPassword (backend login only).
  async resetPasswordWithCode(payload: {
    email: string;
    otp: string;
    newPassword: string;
    newPasswordConfirm: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this._baseUrl}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to reset password"));
    }
    return res.json();
  }
}
