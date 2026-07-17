import { auth } from "@/config/firebase";
import { useAuthStore } from "@/stores/auth-store";
import { getIdToken, type User } from "firebase/auth";

export const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

/**
 * Routes that anonymous visitors are allowed to sit on. A 401 from a background call here
 * is expected (the visitor has no session) and must NOT bounce them to /auth — the public
 * dashboard embeds components whose data hooks are authenticated.
 */
const PUBLIC_ROUTES = ["/"];

const isOnPublicRoute = (): boolean =>
  typeof window !== "undefined" && PUBLIC_ROUTES.includes(window.location.pathname);

/**
 * Public API fetch - does NOT redirect to auth on 401
 * Use this for endpoints that should be accessible without authentication
 */
export const publicApiFetch = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> => {
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
  };

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.status === 204) {
      return undefined as T;
    }

    const text = await res.text();
    const safeJson = (t: string) => {
      try {
        return t ? JSON.parse(t) : null;
      } catch {
        return null;
      }
    };

    const data = safeJson(text);

    if (!res.ok) {
      // Log error but don't redirect - this is a public endpoint
      console.warn(`Public API request failed with status ${res.status}:`, url);
      let errorMessage = `Request failed with status ${res.status}`;
      if (data?.message) {
        errorMessage = data.message;
      } else if (res.statusText) {
        errorMessage = res.statusText;
      } else if (text && text.length < 200) {
        errorMessage = text;
      }
      throw new Error(errorMessage);
    }

    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  }
};

export const apiFetch = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> => {
  const firebaseUser = await getCurrentUser();

  let token: string | null = null;
  if (firebaseUser) {
    try {
      token = await getIdToken(firebaseUser);
    } catch (err) {
      console.error("Failed to get token:", err);
    }
  }

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
  };
  // const headers = {
  //   ...(options.headers || {}),
  //   Authorization: token ? `Bearer ${token}` : "",
  //   "Content-Type": "application/json",
  // };

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.status === 204) {
      return undefined as T;
    }
    if (res.status === 404 && options?.method === "PUT") {
      return null as T;
    }

    const text = await res.text();
    const safeJson = (t: string) => {
      try {
        return t ? JSON.parse(t) : null;
      } catch {
        return null;
      }
    };

    const data = safeJson(text);

    if (!res.ok) {
      if (res.status === 401) {
        // On a public route the visitor is anonymous by design — a 401 here means "this
        // endpoint needs auth", not "your session expired". Fail the call quietly and let
        // the caller render without it, rather than hijacking the page to /auth.
        if (isOnPublicRoute()) {
          console.warn("Unauthorized request on a public route (not redirecting):", url);
          throw new Error(`Request failed with status 401`);
        }
        console.warn("Unauthorized request, clearing user and redirecting to login");
        const { clearUser } = useAuthStore.getState();
        clearUser();
        window.location.href = "/auth";
        return null;
      }
      let errorMessage = `Request failed with status ${res.status}`;
      if (data?.message) {
        errorMessage = data.message;
      } else if (res.statusText) {
        errorMessage = res.statusText;
      } else if (text && text.length < 200) {
        errorMessage = text;
      }

      throw new Error(errorMessage);
    }

    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  }
};
