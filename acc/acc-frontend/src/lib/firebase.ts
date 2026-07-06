import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { firebaseConfig } from "@/config/firebase";
import { useAuthStore } from "@/stores/auth-store";
import { UserService } from "@/hooks/services/userService";
import { AuthService } from "@/hooks/services/authService";
import { isDevelopment } from "@/shared/app";

const authService = new AuthService();

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
const userService = new UserService();

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const user = await userService.getCurrentUser();
    const isCallAgent = user?.role === "call_agent";
    if (user && !isCallAgent) {
       throw new Error("Only call agents can access this system.");
    }
    const result = await signInWithEmailAndPassword(auth, email, password);

    if (!result.user.emailVerified && !isDevelopment) {
      try {
        await authService.resendVerification(email);
      } catch (resendError) {
        console.error("Failed to trigger verification resend:", resendError);
      }

      await signOut(auth);
      throw new Error("Please verify your email before logging in. A new verification link has been sent to your email.");
    }

    const idToken = await result.user.getIdToken();
    const syncResponse = await authService.accountSync(idToken);

    return Object.assign(result, { appUser: syncResponse?.user });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes("Only call agents") || error.message.includes("Please verify your email"))) {
      throw error;
    }
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await result.user.getIdToken();
      const syncResponse = await authService.accountSync(idToken);
      return Object.assign(result, { appUser: syncResponse?.user });
    } catch (authError) {
      throw authError;
    }
  }
};

export const logout = () => {
  signOut(auth);
  useAuthStore.getState().clearUser();
};
