import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  TtsService,
  type TtsRequestPayload,
  type TtsResponse,
} from "../../services/ttsService";

const ttsService = new TtsService();

/**
 * TanStack Query mutation for synthesizing (or fetching from cache) TTS audio.
 *
 * We use `useMutation` rather than `useQuery` so the request fires only when
 * the user clicks the speaker button — the audio is not pre-fetched.
 */
export const useFetchTtsAudio = () => {
  return useMutation<TtsResponse | null, Error, TtsRequestPayload>({
    mutationKey: ["tts", "synthesize"],
    mutationFn: async (payload: TtsRequestPayload) => {
      try {
        return await ttsService.synthesize(payload);
      } catch (error) {
        throw error instanceof Error ? error : new Error("Unknown TTS error");
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to synthesize audio. Please try again.",
      );
      console.error("[TTS] useFetchTtsAudio error:", error);
    },
  });
};
