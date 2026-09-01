export interface PlantScanResult {
  identified: boolean;
  name: string;
  confidence: number;
  description: string;
}

export async function analyzePlant(
  image: Blob
): Promise<PlantScanResult> {
  // Development-only placeholder.
  // This will later be replaced with the real AjraSakha vision API call.

  console.log("Analyzing image:", {
    size: image.size,
    type: image.type,
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));

  return {
    identified: true,
    name: "Demo Plant",
    confidence: 0.92,
    description:
      "This is a development result. The real AjraSakha vision model will identify the plant or agricultural object here.",
  };
}