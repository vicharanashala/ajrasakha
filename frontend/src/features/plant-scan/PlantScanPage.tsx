import {useEffect, useState} from "react";
import CameraView from "./CameraView";
import {
  analyzePlant,
  type PlantScanResult,
} from "./plantScanService";

function formatLabel(value: string) {
  return value
    .replace(/___/g, " — ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getConfidenceLabel(confidence: number) {
  if (confidence >= 0.9) {
    return "Very confident";
  }

  if (confidence >= 0.75) {
    return "Confident";
  }

  if (confidence >= 0.5) {
    return "Moderate confidence";
  }

  return "Low confidence";
}

function getDiseaseConfidenceLabel(score: number) {
  if (score >= 0.75) {
    return "Strong signal";
  }

  if (score >= 0.5) {
    return "Moderate signal";
  }

  return "Weak signal";
}

function formatPercentage(score: number) {
  return `${Math.round(
    Math.min(1, Math.max(0, score)) * 100,
  )}%`;
}

export default function PlantScanPage() {
  const [capturedImage, setCapturedImage] =
    useState<Blob | null>(null);

  const [capturedImageUrl, setCapturedImageUrl] =
    useState<string | null>(null);

  const [result, setResult] =
    useState<PlantScanResult | null>(null);

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const handleCapture = (image: Blob) => {
    setError(null);
    setResult(null);
    setCapturedImage(image);

    const imageUrl = URL.createObjectURL(image);

    setCapturedImageUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return imageUrl;
    });
  };

  const handleAnalyze = async () => {
    if (!capturedImage || isAnalyzing) {
      return;
    }

    try {
      setIsAnalyzing(true);
      setError(null);
      setResult(null);

      const scanResult =
        await analyzePlant(capturedImage);

      setResult(scanResult);
    } catch (err) {
      console.error(
        "Plant analysis failed:",
        err,
      );

      setError(
        err instanceof Error &&
          err.message &&
          !err.message.includes("status")
          ? err.message
          : "Unable to analyze the image. Please try again.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setCapturedImage(null);
    setResult(null);
    setError(null);
    setIsAnalyzing(false);

    setCapturedImageUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return null;
    });
  };

  useEffect(() => {
    return () => {
      if (capturedImageUrl) {
        URL.revokeObjectURL(capturedImageUrl);
      }
    };
  }, [capturedImageUrl]);

  if (!capturedImageUrl) {
    return (
      <div className="relative h-screen w-full overflow-hidden bg-black">
        <CameraView onCapture={handleCapture} />

        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-5 text-white">
          <h1 className="text-xl font-semibold">
            AjraSakha Scan
          </h1>

          <p className="mt-1 text-sm text-white/80">
            Point your camera at a plant, leaf, or crop.
          </p>
        </div>

        <div className="pointer-events-none absolute bottom-28 left-0 right-0 z-10 text-center text-sm text-white">
          Tap the scan button to capture the object
        </div>
      </div>
    );
  }

  const plantConfidence = Math.min(
    1,
    Math.max(0, result?.confidence ?? 0),
  );

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="flex min-h-screen flex-col">
        {/* Captured image */}
        <div className="relative flex-1 overflow-hidden">
          <img
            src={capturedImageUrl}
            alt="Captured plant or agricultural object"
            className="h-full min-h-[55vh] w-full object-cover"
          />

          <div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-5">
            <h1 className="text-xl font-semibold">
              AjraSakha Scan
            </h1>

            <p className="mt-1 text-sm text-white/80">
              Review your captured image.
            </p>
          </div>
        </div>

        {/* Bottom panel */}
        <div className="space-y-4 bg-black p-5">
          {!result && (
            <>
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAnalyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                    Analyzing image...
                  </span>
                ) : (
                  "Analyze Image"
                )}
              </button>

              <p className="text-center text-xs text-white/50">
                AjraSakha identifies the plant and checks the
                image for probable plant health issues.
              </p>
            </>
          )}

          {result && (
            <div className="space-y-5">
              {/* Identification */}
              <div>
                <p className="text-sm text-white/50">
                  {result.identified
                    ? "Likely plant identification"
                    : "Plant identification"}
                </p>

                <h2 className="mt-1 text-3xl font-semibold">
                  {result.plantName
                    ? formatLabel(result.plantName)
                    : "Unknown"}
                </h2>

                {result.scientificName && (
                  <p className="mt-1 text-base italic text-white/60">
                    {result.scientificName}
                  </p>
                )}

                {!result.identified && (
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    We could not confidently identify the plant in
                    this image. Try a closer, well-lit photo with the
                    plant clearly visible.
                  </p>
                )}
              </div>

              {/* Plant identification confidence */}
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/50">
                      Identification confidence
                    </p>

                    <p className="mt-1 text-sm text-white/70">
                      {getConfidenceLabel(
                        plantConfidence,
                      )}
                    </p>
                  </div>

                  <span className="text-lg font-semibold">
                    {formatPercentage(plantConfidence)}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{
                      width: formatPercentage(
                        plantConfidence,
                      ),
                    }}
                  />
                </div>
              </div>

              {/* Observation */}
              {result.observations.length > 0 && (
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-sm font-semibold">
                    What was observed
                  </p>

                  <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                    {result.observations.map(
                      (observation) => (
                        <li key={observation}>
                          • {observation}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}

              {/* Disease analysis */}
              {result.identified &&
                result.diseaseAnalysisAvailable &&
                result.diseases.length > 0 && (
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-sm font-semibold">
                      Possible health issues
                    </p>

                    <p className="mt-2 text-xs leading-5 text-white/50">
                      These are probable conditions returned by the
                      disease model. They are not a confirmed diagnosis.
                    </p>

                    <div className="mt-4 space-y-4">
                      {result.diseases
                        .slice(0, 3)
                        .map((disease) => (
                          <div
                            key={`${disease.code}-${disease.score}`}
                            className="rounded-xl bg-white/5 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  {disease.name}
                                </p>

                                <p className="mt-1 text-xs text-white/40">
                                  Code: {disease.code}
                                </p>
                              </div>

                              <span className="shrink-0 text-sm font-semibold">
                                {formatPercentage(
                                  disease.score,
                                )}
                              </span>
                            </div>

                            <p className="mt-2 text-xs text-white/40">
                              {getDiseaseConfidenceLabel(
                                disease.score,
                              )}
                            </p>

                            {disease.description &&
                              disease.description !==
                                disease.name && (
                                <p className="mt-2 text-sm leading-6 text-white/60">
                                  {disease.description}
                                </p>
                              )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              {result.identified &&
                result.diseaseAnalysisAvailable &&
                result.diseases.length === 0 && (
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-sm font-semibold">
                      Plant health analysis
                    </p>

                    <p className="mt-2 text-sm leading-6 text-white/60">
                      The disease model did not return a probable
                      condition for this image.
                    </p>
                  </div>
                )}

              {result.identified &&
                !result.diseaseAnalysisAvailable && (
                  <p className="text-center text-xs leading-5 text-white/40">
                    Plant identification succeeded, but disease
                    analysis was unavailable for this scan.
                  </p>
                )}

              {/* Benefits */}
              {result.benefits.length > 0 && (
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-sm font-semibold">
                    Plant benefits
                  </p>

                  <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                    {result.benefits.map((benefit) => (
                      <li key={benefit}>
                        • {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Common problems */}
              {result.commonProblems.length > 0 && (
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-sm font-semibold">
                    Common problems to watch for
                  </p>

                  <div className="mt-3 space-y-4">
                    {result.commonProblems.map(
                      (problem) => (
                        <div key={problem.name}>
                          <p className="text-sm font-medium">
                            {problem.name}
                          </p>

                          <p className="mt-1 text-sm leading-6 text-white/60">
                            <span className="text-white/40">
                              Symptoms:
                            </span>{" "}
                            {problem.symptoms}
                          </p>

                          <p className="mt-1 text-sm leading-6 text-white/60">
                            <span className="text-white/40">
                              Management:
                            </span>{" "}
                            {problem.treatment}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-sm font-semibold">
                    Recommended next steps
                  </p>

                  <ul className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                    {result.recommendations.map(
                      (recommendation) => (
                        <li key={recommendation}>
                          • {recommendation}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}

              {/* Alternative identifications */}
              {result.plantNetCandidates.length > 1 && (
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="text-sm font-semibold">
                    Other possible matches
                  </p>

                  <div className="mt-3 space-y-2">
                    {result.plantNetCandidates
                      .slice(1, 4)
                      .map((candidate) => (
                        <div
                          key={`${candidate.scientificName}-${candidate.score}`}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-white/80">
                              {candidate.commonNames[0] ||
                                candidate.scientificName}
                            </p>

                            <p className="text-xs italic text-white/40">
                              {candidate.scientificName}
                            </p>
                          </div>

                          <span className="shrink-0 text-white/50">
                            {formatPercentage(
                              candidate.score,
                            )}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Knowledge disclaimer */}
              {!result.knowledgeAvailable &&
                result.identified && (
                  <p className="text-center text-xs leading-5 text-white/40">
                    Plant-specific care information is not available
                    for this identification yet. Confirm the species
                    before using treatment advice.
                  </p>
                )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-center text-sm text-red-300">
              {error}
            </p>
          )}

          {/* Retake */}
          <button
            type="button"
            onClick={handleReset}
            disabled={isAnalyzing}
            className="w-full rounded-2xl border border-white/20 px-5 py-4 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Retake Photo
          </button>
        </div>
      </div>
    </div>
  );
}