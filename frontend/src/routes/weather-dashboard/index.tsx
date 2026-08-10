import { createFileRoute } from "@tanstack/react-router";
import { WeatherDashboard } from "@/features/weatherDashboard/WeatherDashboard";

export const Route = createFileRoute("/weather-dashboard/")({
  component: WeatherDashboardRouteComponent,
});

function WeatherDashboardRouteComponent() {
  return <WeatherDashboard />;
}
