import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const { initAuthListener } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = initAuthListener();
    navigate({ to: "/home" });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [initAuthListener, navigate]);

  return <></>;
}
