// src/proctoring/detectors/startFaceDetection.ts
// src/proctoring/detectors/startFaceDetection.ts
import type { RefObject } from "react";
import type { Face } from "@tensorflow-models/face-detection";

/**
 * Launches the FaceDetectorWorker, samples frames from <video>,
 * returns a cleanup function.
 *
 * @param videoRef  ref to the same <video> element used by other detectors
 * @param fps       how many frames per second to send to the worker
 * @param onFaces   callback invoked with every detection result
 */
export default function startFaceDetection(
  videoRef: RefObject<HTMLVideoElement | null>,
  onFaces: (faces: Face[]) => void,
  fps = 3
) {
  /* ---------- worker ---------- */
  const worker = new Worker(
    new URL("../workers/FaceDetectorWorker.ts", import.meta.url),
    { type: "module" }
  );

  worker.onmessage = ({ data }) => {
    if (data.type === "DETECTION_RESULT") onFaces(data.faces);
  };
  worker.postMessage({ type: "INIT" });

  /* ---------- sampling loop ---------- */
  const interval = setInterval(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    /* ImageBitmap keeps transfer cost low */
    const bitmap = await createImageBitmap(canvas);
    worker.postMessage({ type: "DETECT_FACES", image: bitmap }, [bitmap]);
  }, 1000 / fps);

  /* ---------- cleanup ---------- */
  return () => {
    clearInterval(interval);
    worker.terminate();
  };
}
