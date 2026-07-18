import { createFileRoute } from "@tanstack/react-router";
import { CropCalendarPage } from "@/features/cropCalendar/CropCalendarPage";

export const Route = createFileRoute("/crop-calendar/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CropCalendarPage />;
}
