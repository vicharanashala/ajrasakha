import { auth, googleProvider } from "@/config/firebase";
import type { AuthUser, ExtendedUserCredential } from "@/types";
import {
  // getIdToken,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface AuthStore {
  user: AuthUser | null;
  firebaseUser: User | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<ExtendedUserCredential | null>;
  logout: () => Promise<void>;
  initAuthListener: () => void;
  setUser: (user: AuthUser | null) => void;
  isAuthenticated: boolean;
  clearUser: () => void;
  setFirebaseUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        loading: false,
        error: null,
        isAuthenticated: false,
        firebaseUser: null,
        setFirebaseUser: (firebaseUser) =>
          set({ firebaseUser }, undefined, "setFirebaseUser"),

        setUser: (user) => set({ user }, undefined, "setUser"),
        // token: localStorage.getItem("firebase-auth-token"),
        // setToken: (token: string) => {
        //   localStorage.setItem("firebase-auth-token", token);
        //   set({ isAuthenticated: true });
        // },
        clearUser: () => {
          localStorage.removeItem("firebase-auth-token");
          localStorage.removeItem("user-id");
          localStorage.removeItem("user-email");
          localStorage.removeItem("user-firstName");
          localStorage.removeItem("user-lastName");
          set({ user: null, isAuthenticated: false });
        },
        loginWithGoogle: async (): Promise<ExtendedUserCredential | null> => {
          set({ loading: true, error: null });
          try {
            const result = await signInWithPopup(auth, googleProvider);
            // const token = await getIdToken(result.user);
            const authUser: AuthUser = {
              uid: result.user.uid,
              email: result.user.email || "",
              name: result.user.displayName || "",
              avatar: result.user.photoURL || "",
            };
            set(
              { user: authUser, firebaseUser: result.user, loading: false },
              undefined,
              "loginWithGoogle"
            );
            return result;
          } catch (err: any) {
            console.error(err);
            set({ error: err.message || "Login failed", loading: false });
            return null;
          }
        },

        logout: async () => {
          set({ loading: true });
          try {
            await signOut(auth);
            set(
              { user: null, firebaseUser: null, loading: false },
              undefined,
              "logout"
            );
          } catch (err: any) {
            console.error(err);
            set({ error: err.message || "Logout failed", loading: false });
          }
        },

        initAuthListener: () => {
          set({ loading: true });
          onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
              const authUser: AuthUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                name: firebaseUser.displayName || "",
                avatar: firebaseUser.photoURL || "",
              };

              set({
                user: authUser,
                firebaseUser,
                loading: false,
                isAuthenticated: true,
              });
            } else {
              set({ user: null, firebaseUser: null, loading: false });
            }
          });
        },
      }),
      {
        name: "auth-storage", // localStorage key
      }
    ),
    { name: "AuthStore", enabled: true } // DevTools store name
  )
);
