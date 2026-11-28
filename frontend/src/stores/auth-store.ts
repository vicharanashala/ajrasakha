import { auth, googleProvider } from "@/config/firebase";
import { clearLocalAuthToken, getLocalAuthToken } from "@/lib/localAuthToken";
import { queryClient } from "@/routes/__root";
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
  updateUser: (data: Partial<AuthUser>) => void;
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

        clearUser: () => {
          localStorage.removeItem("firebase-auth-token");
          clearLocalAuthToken();
          localStorage.removeItem("user-id");
          localStorage.removeItem("user-email");
          localStorage.removeItem("user-firstName");
          localStorage.removeItem("user-lastName");
          set({ user: null, isAuthenticated: false });
        },
        updateUser: (data) =>
          set(
            (state) =>
              state.user
                ? { user: { ...state.user, ...data } }
                : state,
            undefined,
            "updateUser"
          ),
        loginWithGoogle: async (): Promise<ExtendedUserCredential | null> => {
          set({ loading: true, error: null });
          try {
            if (!auth) throw new Error("Google login is disabled");
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
            if (auth) await signOut(auth);
            clearLocalAuthToken();
            queryClient.clear();
            localStorage.removeItem("questionDrafts");
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
          if (!auth) {
            // Local login: the persisted user stays valid while a token exists; an expired token gets a 401 in apiFetch.
            const hasToken = Boolean(getLocalAuthToken());
            set((state) => ({
              user: hasToken ? state.user : null,
              firebaseUser: null,
              loading: false,
              isAuthenticated: hasToken && Boolean(state.user),
            }));
            return;
          }
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
