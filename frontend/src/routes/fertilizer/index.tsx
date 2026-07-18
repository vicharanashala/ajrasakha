import { createFileRoute } from "@tanstack/react-router";
import { FertilizerCalculatorPage } from "@/features/fertilizerCalculator/FertilizerCalculatorPage";

export const Route = createFileRoute("/fertilizer/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <FertilizerCalculatorPage />;
}
