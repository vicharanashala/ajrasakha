import { createFileRoute } from "@tanstack/react-router";
import { AjrasakhaHub } from "@/features/ajrasakhaHub/AjrasakhaHub";

export const Route = createFileRoute("/")({
  component: () => <AjrasakhaHub initialTab="farmer-feedback" />,
});

