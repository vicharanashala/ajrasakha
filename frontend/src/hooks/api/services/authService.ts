import type { ExtendedUserCredential } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class AuthService {
  private _baseUrl = `${API_BASE_URL}/auth`;

  async loginWithGoogle(firebaseLoginRes: ExtendedUserCredential) {
    try {
      const backendUrl = `${this._baseUrl}/signup/google/`;
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firebaseLoginRes._tokenResponse?.idToken}`,
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
}
