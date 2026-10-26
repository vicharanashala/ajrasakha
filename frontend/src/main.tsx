import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
import reportWebVitals from "./reportWebVitals.ts";
import { client } from "./client/client.gen.ts";
import { env } from "./config/env.ts";
import { ToastProvider } from "./shared/components/toast.tsx";

// ── Demo bypass: if visiting /gap-detector, inject a fake auth user into
//    localStorage BEFORE the router loads, so Firebase's "no user" callback
//    doesn't redirect to /auth ──────────────────────────────────────────────
if (window.location.pathname.startsWith("/gap-detector")) {
  try {
    const stored = localStorage.getItem("auth-storage");
    const parsed = stored ? JSON.parse(stored) : {};
    if (!parsed?.state?.user) {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({
          state: {
            user: {
              uid: "demo-iitropar",
              email: "intern@iitropar.ac.in",
              name: "IIT Ropar Intern",
              avatar: "",
            },
            firebaseUser: null,
            isAuthenticated: true,
            loading: false,
            error: null,
          },
          version: 0,
        })
      );
    }
  } catch (_) {}
}
// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap() {
  // Enable MSW only when explicitly allowed
  if (env.enableMocks()) {
    const { worker } = await import("./mocks/browser");
    await worker.start();
  }

  client.setConfig({
    baseUrl: env.apiBaseUrl() || "http://localhost:4000",
  });

  const router = createRouter({
    routeTree,
    context: {},
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
  });

  const rootElement = document.getElementById("app");
  if (rootElement && !rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <StrictMode>
        <ToastProvider position="bottom-right" defaultDuration={4000} />
        <RouterProvider router={router} />
      </StrictMode>,
    );
  }

  reportWebVitals();
}

bootstrap();
