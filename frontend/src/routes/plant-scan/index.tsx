import { createFileRoute } from "@tanstack/react-router";
import PlantScanPage from "@/features/plant-scan/PlantScanPage";

export const Route = createFileRoute("/plant-scan/")({
  component: PlantScanPage,
});
