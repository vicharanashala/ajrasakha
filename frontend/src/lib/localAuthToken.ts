// Stores the backend-issued token used when Firebase login is disabled.
const LOCAL_AUTH_TOKEN_KEY = "local-auth-token";

// Returns the stored local login token, or null when the user is logged out.
export const getLocalAuthToken = (): string | null =>
  localStorage.getItem(LOCAL_AUTH_TOKEN_KEY);

export const setLocalAuthToken = (token: string): void => {
  localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, token);
};

export const clearLocalAuthToken = (): void => {
  localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
};
