import { auth } from "@/config/firebase";
import { getIdToken, type User } from "firebase/auth";

const getCurrentUser = (): Promise<User | null> => {
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
  if (!firebaseUser) return null;

  let token: string;
  try {
    token = await getIdToken(firebaseUser);
  } catch (err) {
    console.error("Failed to get token:", err);
    return null;
  }
  const headers = {
    ...(options.headers || {}),
    Authorization: token ? `Bearer ${token}` : "",
    "Content-Type": "application/json",
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
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

  // return empty for 204 responses
  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
};
