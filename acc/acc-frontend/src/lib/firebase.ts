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

    // Fetch user profile from /me (with auth headers) to check role access
    const user = await userService.getCurrentUser();
    const allowedRoles = ["call_agent", "admin", "moderator"];
    if (user && !allowedRoles.includes(user.role)) {
      await signOut(auth);
      throw new Error("Only call agents and administrators can access this system.");
    }

    return Object.assign(result, { appUser: syncResponse?.user });
  } catch (error) {
    throw error;
  }
};

export const logout = () => {
  signOut(auth);
  useAuthStore.getState().clearUser();
};

export const verifyCurrentPassword = async (
  email: string,
  currentPassword: string
) => {
  if (!auth.currentUser) throw new Error("User not logged in");

  const credential = EmailAuthProvider.credential(email, currentPassword);

  try {
    await reauthenticateWithCredential(auth.currentUser, credential);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateUserPassword = async (newPassword: string) => {
  if (!auth.currentUser) throw new Error("User not logged in");

  try {
    await updatePassword(auth.currentUser, newPassword);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

