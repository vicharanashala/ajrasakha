import { useAuthStore } from "@/stores/auth-store";

export const apiFetch = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> => {
  const isFormData = options.body instanceof FormData;

  const token = localStorage.getItem("auth-token");
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

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
