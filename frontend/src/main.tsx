import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
import reportWebVitals from "./reportWebVitals.ts";
import { worker } from "./mocks/browser.js";
import { client } from "./client/client.gen.ts";
// import { useAuthStore } from "./stores/auth-store.ts";

if (import.meta.env.VITE_ENABLE_MOCKS === "true") {
  await worker.start();
}
client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000",
  // auth: `${useAuthStore.getState().token}`,
});

console.log(import.meta.env.VITE_API_BASE_URL, "API Base URL");

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {},
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
