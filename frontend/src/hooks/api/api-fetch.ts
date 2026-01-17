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
export const apiFetch = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> => {
  const firebaseUser = await getCurrentUser();
  // if (!firebaseUser) return null;
  if(!firebaseUser){
     return fetch(url, options).then((r) => r.json()) as Promise<T>;
  }

  let token: string;
  try {
    token = await getIdToken(firebaseUser);
  } catch (err) {
    console.error("Failed to get token:", err);
    return null;
  }

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    Authorization: token ? `Bearer ${token}` : "",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
  };
  // const headers = {
  //   ...(options.headers || {}),
  //   Authorization: token ? `Bearer ${token}` : "",
  //   "Content-Type": "application/json",
  // };

  const res = await fetch(url, { ...options, headers });
  if (res.status === 204) {
  return undefined as T;
}
if (res.status === 404 && options?.method === "PUT") {
  return null as T;
}

  if (!res.ok) {
    if (res.status === 401) {
      console.warn("Unauthorized request, clearing user and redirecting to login");
      const { clearUser } = useAuthStore.getState();
      clearUser();
      window.location.href = "/auth";
      return null; // Prevent further processing
    }
    let errorMessage = `Request failed with status ${res.status}`;

    try {
      const errorData = await res.json();
      if (errorData?.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = res.statusText || (await res.text()) || errorMessage;
    }

    throw new Error(errorMessage);
  }

  return (await res.json()) as T;
};
