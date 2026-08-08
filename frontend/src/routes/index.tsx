import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/home" });
  }, [navigate]);

  return <></>;
}
