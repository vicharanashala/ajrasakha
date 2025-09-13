// --------------------------------------------------
// webcam-view.tsx   (NEW FILE)
// --------------------------------------------------
import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import useProctoring from "../procotoring/useProctoring";

/* --- OPTIONAL: pass live telemetry down as props --- */
export interface WebCamViewProps {
  faces?: number;
  isBlur?: boolean;
  isFocused?: boolean;
  isRecording?: boolean;
}

export function WebCamView({ isRecording = true }: WebCamViewProps) {
  /* grab a local camera stream once and clean up on unmount */
  const {
    videoRef,
    faces,
    isBlur,
    isSpeaking,
    gesture,
    isFocused,
    penalty,
    anomalies,
  } = useProctoring();

  React.useEffect(() => {
    let stream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(console.error);

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card className="gap-2 py-4 shadow-none">
      <CardHeader className="px-4 flex items-center justify-between space-y-0">
        {/* left-side: recording badge + label */}
        <div className="flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-600 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
          </span>
          <CardDescription className="text-xs font-semibold">
            REC
          </CardDescription>
        </div>

        {/* right-side: anomaly status */}
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              anomalies ? "bg-red-600 animate-pulse" : "bg-green-500"
            }`}
          />
          <CardDescription className="text-xs">
            {anomalies ? "Alert" : "OK"}
          </CardDescription>
        </div>
      </CardHeader>

      {/* ────── VIDEO FEED + OVERLAY STATS ────── */}
      <CardContent className="px-4">
        <div className="relative aspect-video overflow-hidden rounded-md bg-black">
          {/* live camera */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* overlay: proctoring info */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between gap-1 bg-black/60 p-2 text-xs text-white">
            <span>Faces: {faces}</span>
            <span>Blur: {isBlur ? "Yes" : "No"}</span>
            <span>Focused: {isFocused ? "Yes" : "No"}</span>
            <span>Speaking: {isSpeaking ? "Yes" : "No"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
