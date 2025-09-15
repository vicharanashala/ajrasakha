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
} from "firebase/auth";
import { firebaseConfig } from "@/config/firebase";
import { useAuthStore } from "@/stores/auth-store";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

export const loginWithEmail = async (email: string, password: string) => {
  const result = await signInWithEmailAndPassword(auth, email, password);

  // Get ID token for backend authentication
  const idToken = await result.user.getIdToken();

  // Store the token
  useAuthStore.getState().setToken(idToken);

  return result;
};

// Add a function to create a user with email and password
export const createUserWithEmail = async (
  email: string,
  password: string,
  displayName?: string
) => {
  const auth = getAuth(app);
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

export const analytics = getAnalytics(app);
