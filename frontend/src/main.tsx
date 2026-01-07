import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
import reportWebVitals from "./reportWebVitals.ts";
import { client } from "./client/client.gen.ts";
import { env } from "./config/env.ts";
import ReviewMaintenance from "./components/maintainence.tsx";

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
        {/* <RouterProvider router={router} /> */}
        <ReviewMaintenance />

      </StrictMode>
    );
  }

  reportWebVitals();
}

bootstrap();
