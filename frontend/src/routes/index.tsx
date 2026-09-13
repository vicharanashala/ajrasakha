
//To make public dashboard 

 import { createFileRoute } from "@tanstack/react-router";
 import { HomeDashboard } from "@/features/home-dashboard/HomeDashboard";

 export const Route = createFileRoute("/")({
  component: HomeDashboard,
 });

 /*import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const { initAuthListener } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    initAuthListener();
    navigate({ to: "/home" });
  }, [initAuthListener]);

  return <></>;
}*/
