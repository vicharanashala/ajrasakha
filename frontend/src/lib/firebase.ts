// Import the functions you need from the SDKs you need
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
const authService = new AuthService();


// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
const userService = new UserService()
export const loginWithEmail = async (email: string, password: string) => {
  try {
    const user = await userService.Getuser(email)
    if(user?.isBlocked){
      throw new Error("User Is Blocked Please Contact Moderator")
    }
    if(!user?.isBlocked || user === null){
      const result = await signInWithEmailAndPassword(auth, email, password);

      // Enforce email verification
      if (!result.user.emailVerified) {
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
      await authService.accountSync(idToken);

      return result;
    }
  } catch (error: unknown) {
    // If it's a "User Is Blocked" error, re-throw it
    if (error instanceof Error && (error.message === "User Is Blocked Please Contact Moderator" || error.message === "Please verify your email before logging in.")) {
      throw error;
    }
    // Otherwise, if it's a network/fetch error from userService.Getuser, 
    // allow Firebase auth to proceed and return the error from there
    if (error instanceof Error && (error.message.includes("Request failed") || error.message.includes("Failed to"))) {
      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result;
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

export const analytics = getAnalytics(app);
