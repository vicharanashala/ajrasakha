import { type RefObject } from "react";

export default function runBlurDetector(
  videoRef: RefObject<HTMLVideoElement | null>,
  onChange: (isBlurry: boolean) => void
) {
  const worker = new Worker(
    new URL("../workers/BlurDetectorWorker.ts", import.meta.url),
    { type: "module" }
  );

  /* relay blur flag from worker → hook */
  worker.onmessage = ({ data }) => onChange(data.isBlurry);

  /* grab a frame every 500 ms and send to worker */
  const interval = setInterval(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    worker.postMessage(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }, 500);

  /* ---------- cleanup handle ---------- */
  return () => {
    clearInterval(interval);
    worker.terminate();
  };
}
