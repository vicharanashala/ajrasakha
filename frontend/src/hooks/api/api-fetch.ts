import { useAuthStore } from "@/stores/auth-store";

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;

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
}
