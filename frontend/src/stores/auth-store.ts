import { auth, googleProvider } from "@/config/firebase";
import type { AuthUser, ExtendedUserCredential } from "@/types";
import {
  getIdToken,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<ExtendedUserCredential | null>;
  logout: () => Promise<void>;
  initAuthListener: () => void;
  setUser: (user: AuthUser | null) => void;
  isAuthenticated: boolean;
  clearUser: () => void;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        loading: false,
        error: null,
        isAuthenticated: false,

        setUser: (user) => set({ user }, undefined, "setUser"),
        token: localStorage.getItem("firebase-auth-token"),
        setToken: (token: string) => {
          localStorage.setItem("firebase-auth-token", token);
          set({ token, isAuthenticated: true });
        },
        clearUser: () => {
          localStorage.removeItem("firebase-auth-token");
          localStorage.removeItem("user-id");
          localStorage.removeItem("user-email");
          localStorage.removeItem("user-firstName");
          localStorage.removeItem("user-lastName");
          set({ user: null, token: null, isAuthenticated: false });
        },
        loginWithGoogle: async (): Promise<ExtendedUserCredential | null> => {
          set({ loading: true, error: null });
          try {
            const result = await signInWithPopup(auth, googleProvider);
            const token = await getIdToken(result.user);
            const authUser: AuthUser = {
              uid: result.user.uid,
              email: result.user.email || "",
              name: result.user.displayName || "",
              avatar: result.user.photoURL || "",
            };
            set(
              { user: authUser, token, loading: false },
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
              { user: null, token: null, loading: false },
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
          onAuthStateChanged(auth, async (user) => {
            if (user) {
              const token = await getIdToken(user);
              const authUser: AuthUser = {
                uid: user.uid,
                email: user.email || "",
                name: user.displayName || "",
                avatar: user.photoURL || "",
              };
              set({ user: authUser, token, loading: false });
            } else {
              set({ user: null, token: null, loading: false });
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
