export interface PlantScanResult {
  identified: boolean;
  plantName: string | null;
  scientificName: string | null;
  confidence: number;

  // Kept for compatibility with the existing UI contract.
  condition: string | null;
  severity: 'low' | 'medium' | 'high' | null;

  observations: string[];
  recommendations: string[];
  benefits: string[];

  commonProblems: Array<{
    name: string;
    symptoms: string;
    treatment: string;
  }>;

  knowledgeAvailable: boolean;

  plantNetCandidates: Array<{
    score: number;
    scientificName: string;
    commonNames: string[];
    genus: string | null;
    family: string | null;
  }>;

  diseases: Array<{
    code: string;
    name: string;
    score: number;
    description: string | null;
  }>;

  diseaseAnalysisAvailable: boolean;
}

export async function analyzePlant(
  image: Blob,
): Promise<PlantScanResult> {
  const formData = new FormData();

  formData.append(
    'file',
    image,
    'plant-scan.jpg',
  );

  const response = await fetch(
    '/api/plant-scan',
    {
      method: 'POST',
      body: formData,
    },
  );

  if (!response.ok) {
    let message = `Plant scan failed with status ${response.status}`;

    try {
      const body = await response.json();

      if (
        body &&
        typeof body.message === 'string' &&
        body.message.trim()
      ) {
        message = body.message;
      }
    } catch {
      // Keep the default status-based message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<PlantScanResult>;
}