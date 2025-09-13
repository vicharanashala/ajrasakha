// import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";

// interface BurstOptions {
//   expectedGesture: string;   // e.g. "Open_Palm", "ILoveYou"
//   activeDurationMs?: number; // default 5 s
//   idleDurationMs?: number;   // default 25 s
//   sampleMs?: number;         // inference interval while active (default 300 ms)
//   onSuccess?: () => void;    // called as soon as a correct gesture is seen
//   onFail?: () => void;       // called if window closes with no match
//   onUpdate?: (label: string) => void; // live updates (optional)
// }


// export default async function runGestureDetector(
//   video: HTMLVideoElement,
//   pollMs: number = 500,
//   onGesture: (label: string) => void
// ) {
//   /* load once */
//   const vision = await FilesetResolver.forVisionTasks(
//     "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
//   );
//   const recognizer = await GestureRecognizer.createFromOptions(vision, {
//     baseOptions: {
//       modelAssetPath:
//         "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
//       delegate: "CPU",
//     },
//     runningMode: "IMAGE",
//   });

//   const interval = setInterval(async () => {
//     const results = await recognizer.recognize(video);
//     if (results.gestures.length) {
//       onGesture(results.gestures[0][0].categoryName);
//     } else {
//       onGesture("No Gesture Detected ❌");
//     }
//   }, pollMs);

//   return () => clearInterval(interval);
// }

import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";

interface BurstOptions {
  expectedGesture: string;
  activeDurationMs?: number; // default 5 s
  idleDurationMs?: number;   // default 25 s
  sampleMs?: number;         // inference interval while active (default 300 ms)
  onSuccess?: () => void;
  onFail?: () => void;
  onUpdate?: (label: string) => void;
}

/**
 * Periodically opens a “gesture window”.  Pure browser version —
 * no NodeJS types, no extra typings needed.
 */
export default async function runGestureBurstDetector(
  video: HTMLVideoElement,
  {
    expectedGesture,
    activeDurationMs = 5_000,
    idleDurationMs = 25_000,
    sampleMs = 300,
    onSuccess,
    onFail,
    onUpdate,
  }: BurstOptions
) {
  /* -------- load model once -------- */
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  const recognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      delegate: "CPU",
    },
    runningMode: "IMAGE",
  });

  /* -------- burst scheduler -------- */
  let cancelled = false;
  let intervalId: number | undefined;
  let timeoutId: number | undefined;

  const startBurst = () => {
    if (cancelled) return;

    let matched = false;

    intervalId = window.setInterval(async () => {
      const results = await recognizer.recognize(video);
      const label =
        results.gestures.length > 0
          ? results.gestures[0][0].categoryName
          : "No Gesture";
      onUpdate?.(label);

      if (label === expectedGesture) {
        matched = true;
        onSuccess?.();
        stopBurst(); // end early
      }
    }, sampleMs);

    const stopBurst = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
      if (!matched) onFail?.();
      timeoutId = window.setTimeout(startBurst, idleDurationMs); // schedule next
    };

    timeoutId = window.setTimeout(stopBurst, activeDurationMs);
  };

  /* kick off first cycle */
  startBurst();

  /* -------- cleanup -------- */
  return () => {
    cancelled = true;
    if (intervalId !== undefined) clearInterval(intervalId);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  };
}
