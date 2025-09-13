import { createFileRoute } from "@tanstack/react-router";

import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { PlaygroundPage } from "@/components/play-ground";

export const Route = createFileRoute("/home/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 p-4 relative flex flex-col">
      <PlaygroundPage />
    </div>
  );
}
