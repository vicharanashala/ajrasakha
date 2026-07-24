import { env } from "@/config/env";

export async function transcribeAudioWithSarvam(
  audioBlob: Blob,
  languageCode: string = "unknown"
): Promise<string> {
  if (!audioBlob || audioBlob.size === 0) {
    throw new Error("Audio recording is empty.");
  }

  const apiKey = env.sarvamApiKey();
  if (!apiKey || apiKey.includes("dummy")) {
    console.warn("⚠️ Sarvam API key not configured or using dummy key.");
  }

  // Extract base MIME type without parameters (e.g., "audio/webm;codecs=opus" -> "audio/webm")
  const rawMime = audioBlob.type || "audio/webm";
  const baseMime = rawMime.split(";")[0].trim().toLowerCase() || "audio/webm";

  // Determine file extension based on base MIME
  const extension = baseMime.includes("wav")
    ? "wav"
    : baseMime.includes("mp4") || baseMime.includes("m4a")
      ? "m4a"
      : baseMime.includes("mp3") || baseMime.includes("mpeg")
        ? "mp3"
        : "webm";

  // Construct a clean File object with exact base MIME type accepted by Sarvam API
  const cleanFile = new File([audioBlob], `speech.${extension}`, { type: baseMime });

  const formData = new FormData();
  formData.append("file", cleanFile);
  formData.append("model", "saaras:v3");
  formData.append("language_code", languageCode || "unknown");

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Sarvam STT API error [${response.status}]:`, errorText);
    throw new Error(`Sarvam STT failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const transcript = data.transcript || data.text || "";
  if (!transcript.trim()) {
    throw new Error("No speech detected in audio.");
  }

  return transcript.trim();
}
