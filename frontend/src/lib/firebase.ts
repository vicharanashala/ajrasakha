import { useAuthStore } from "@/stores/auth-store";
import { AuthService } from "@/hooks/services/authService";
import { isDevelopment } from "@/shared/app";
import { env } from "@/config/env";
const authService = new AuthService();

const API_BASE_URL = env.apiBaseUrl();

export const provider = {} as any;

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const backendUrl = `${API_BASE_URL}/auth/login`;
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const msg = errorData.message || errorData.error?.message || `Login failed: ${res.status}`;
      throw new Error(msg);
    }

    const result = await res.json();

    let appUser: any = null;
    try {
      const syncResponse = await authService.accountSync(result.idToken);
      appUser = syncResponse?.user;
    } catch (e) {
      // DB may not be available in dev
    }

    localStorage.setItem("auth-token", result.idToken);

    const customUser = {
      uid: result.localId || "",
      email: result.email || email,
      displayName: result.displayName || email.split("@")[0],
      photoURL: null as string | null,
      emailVerified: isDevelopment,
      getIdToken: async () => result.idToken,
    };

    return Object.assign(
      { user: customUser },
      { appUser }
    );
  } catch (error: unknown) {
    throw error;
  }
};

export const createUserWithEmail = async (
  email: string,
  password: string,
  displayName?: string
) => {
  return { user: { uid: "dev-user", email, displayName } };
};

export const logout = async () => {
  useAuthStore.getState().clearUser();
};

export const verifyCurrentPassword = async (
  email: string,
  currentPassword: string
) => {
  return { success: true };
};

export const updateUserPassword = async (newPassword: string) => {
  return { success: true };
};
