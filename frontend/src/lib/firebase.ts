import { getAnalytics } from "firebase/analytics";
import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth, firebaseApp } from "@/config/firebase";
import { getLocalAuthToken, setLocalAuthToken } from "@/lib/localAuthToken";
import { useAuthStore } from "@/stores/auth-store";
import { UserService } from "@/hooks/services/userService";
import { AuthService } from "@/hooks/services/authService";
import { isDevelopment } from "@/shared/app";
const authService = new AuthService();


const userService = new UserService()

// Logs in with the backend's MongoDB password check and stores the issued token (Firebase login disabled).
const loginWithBackendPassword = async (email: string, password: string) => {
  const response = await authService.localLogin(email, password);
  setLocalAuthToken(response.idToken);
  return {
    user: {
      uid: response.localId,
      email: response.email,
      displayName: response.displayName,
      photoURL: "",
    },
    appUser: response.user,
  };
};

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const user = await userService.Getuser(email)
    // Moderators, Experts, GateKeepers, and Auditors are gated by activity status
    // (isBlocked is their check-in/checkout availability flag); every other role is
    // gated by isBlocked, as before.
    const isGatedRole =
      user?.role === "moderator" ||
      user?.role === "expert" ||
      user?.role === "gate_keeper" ||
      user?.role === "auditor";
    const deniedLogin = isGatedRole ? user?.status === "in-active" : !!user?.isBlocked;
    if (deniedLogin) {
      throw new Error("User marked as Inactive Please Contact Moderator")
    }
    if (!deniedLogin || user === null) {
      if (!auth) {
        return await loginWithBackendPassword(email, password);
      }
      const result = await signInWithEmailAndPassword(auth, email, password);

      // Enforce email verification
      if (!result.user.emailVerified && !isDevelopment) {
        try {
          await authService.resendVerification(email);
        } catch (resendError) {
          console.error("Failed to trigger verification resend:", resendError);
        }

        await signOut(auth);
        throw new Error("Please verify your email before logging in. A new verification link has been sent to your email.");
      }

      // Sync user with backend database
      const idToken = await result.user.getIdToken();
      const syncResponse = await authService.accountSync(idToken);

      return Object.assign(result, { appUser: syncResponse?.user });
    }
  } catch (error: unknown) {
    // If it's a "User Is Blocked" error, re-throw it
    if (error instanceof Error && (error.message === "User marked as Inactive Please Contact Moderator" || error.message === "Please verify your email before logging in.")) {
      throw error;
    }
    // Otherwise, if it's a network/fetch error from userService.Getuser, 
    // allow Firebase auth to proceed and return the error from there
    if (error instanceof Error && (error.message.includes("Request failed") || error.message.includes("Failed to"))) {
      try {
        if (!auth) {
          return await loginWithBackendPassword(email, password);
        }
        const result = await signInWithEmailAndPassword(auth, email, password);
        const idToken = await result.user.getIdToken();
        const syncResponse = await authService.accountSync(idToken);
        return Object.assign(result, { appUser: syncResponse?.user });
      } catch (authError) {
        throw authError;
      }
    }
    throw error;
  }
};

// Add a function to create a user with email and password
export const createUserWithEmail = async (
  email: string,
  password: string,
  displayName?: string
) => {
  if (!auth) throw new Error("Firebase login is disabled");
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  // Update user profile if display name is provided
  if (displayName && userCredential.user) {
    await updateProfile(userCredential.user, {
      displayName,
    });
  }

  return userCredential;
};

export const logout = () => {
  if (auth) signOut(auth);
  useAuthStore.getState().clearUser();
};

export const verifyCurrentPassword = async (
  email: string,
  currentPassword: string
) => {
  if (!auth?.currentUser) throw new Error("User not logged in");

  const credential = EmailAuthProvider.credential(email, currentPassword);

  try {
    await reauthenticateWithCredential(auth.currentUser, credential);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateUserPassword = async (newPassword: string) => {
  if (!auth?.currentUser) throw new Error("User not logged in");

  try {
    await updatePassword(auth.currentUser, newPassword);
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

// Changes the password through the backend when Firebase login is disabled and stores the refreshed token.
export const changePasswordWithBackend = async (
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; incorrectCurrentPassword: boolean; errorMessage?: string }> => {
  const token = getLocalAuthToken();
  if (!token) throw new Error("User not logged in");

  try {
    const response = await authService.changePassword(token, currentPassword, newPassword);
    // The backend revokes older tokens on password change, so the new one must replace it.
    if (response.idToken) setLocalAuthToken(response.idToken);
    return { success: true, incorrectCurrentPassword: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Backend messages (e.g. password policy) are safe to show and tell the user what to fix.
    return {
      success: false,
      incorrectCurrentPassword: message === "Incorrect current password",
      errorMessage: message || undefined,
    };
  }
};

export const analytics = firebaseApp ? getAnalytics(firebaseApp) : null;
