import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
import reportWebVitals from "./reportWebVitals.ts";
import { client } from "./client/client.gen.ts";
import { env } from "./config/env.ts";
import { useAuthStore } from "@/stores/auth-store";
import { ToastProvider } from "./shared/components/toast.tsx";

async function bootstrap() {
  // Enable MSW only when explicitly allowed
  if (env.enableMocks()) {
    const { worker } = await import("./mocks/browser");
    await worker.start();
  }

  client.setConfig({
    baseUrl: env.apiBaseUrl() || "http://localhost:4000",
  });

  // Reconcile authentication once at app bootstrap so that every entry
  // point (including direct navigation to /home) reflects the real
  // Firebase auth state instead of any stale persisted session.
  useAuthStore.getState().initAuthListener();

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
