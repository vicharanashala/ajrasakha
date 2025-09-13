// src/proctoring/utils/isLookingAway.ts
// src/proctoring/utils/isLookingAway.ts
import type { Face } from "@tensorflow-models/face-detection";

export default function isLookingAway(face: Face | undefined): boolean {
  if (!face || !face.box || face.keypoints.length < 6) return true;

  const kp = Object.fromEntries(face.keypoints.map((k) => [k.name, k]));
  const faceW = face.box.width;

  const eyeDist = Math.abs(kp.leftEye.x - kp.rightEye.x) / faceW;
  const noseRatio =
    Math.abs(kp.noseTip.x - kp.leftEye.x) /
    (Math.abs(kp.noseTip.x - kp.leftEye.x) +
      Math.abs(kp.noseTip.x - kp.rightEye.x));
  const earRatio =
    Math.min(
      Math.abs(kp.rightEarTragion.x - kp.rightEye.x),
      Math.abs(kp.leftEarTragion.x - kp.leftEye.x)
    ) /
    Math.max(
      Math.abs(kp.rightEarTragion.x - kp.rightEye.x),
      Math.abs(kp.leftEarTragion.x - kp.leftEye.x)
    );

  return eyeDist < 0.25 || noseRatio < 0.4 || noseRatio > 0.6 || earRatio < 0.5;
}
