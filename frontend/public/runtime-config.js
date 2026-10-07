// Overwritten at container start in Docker; local dev exposes the dummy API key
// so e2e fixtures can mint Auth-Emulator ID tokens (key is ignored there).
window.__RUNTIME_CONFIG__ = window.__RUNTIME_CONFIG__ || {};
window.__RUNTIME_CONFIG__.VITE_FIREBASE_API_KEY =
  window.__RUNTIME_CONFIG__.VITE_FIREBASE_API_KEY || "dummy-local-key";
window.__RUNTIME_CONFIG__.VITE_FIREBASE_AUTH_EMULATOR_HOST =
  window.__RUNTIME_CONFIG__.VITE_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
window.__RUNTIME_CONFIG__.VITE_FIREBASE_PROJECT_ID =
  window.__RUNTIME_CONFIG__.VITE_FIREBASE_PROJECT_ID || "local-emulator";
