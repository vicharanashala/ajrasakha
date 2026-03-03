export function cosineSimilarity(
  vecA: number[],
  vecB: number[],
): number {
  if (!vecA?.length || !vecB?.length) return 0;
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (!magnitudeA || !magnitudeB) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}