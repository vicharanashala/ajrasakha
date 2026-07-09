import { createFileRoute } from "@tanstack/react-router";
import { FertilizerCalculator } from "@/features/fertilizer-calculator/FertilizerCalculator";

export const Route = createFileRoute("/fertilizer-calculator/")({
  component: FertilizerCalculator,
});
