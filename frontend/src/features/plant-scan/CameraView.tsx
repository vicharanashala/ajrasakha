import { useEffect, useRef, useState } from "react";

interface CameraViewProps {
  onCapture?: () => void;
}

export default function CameraView({ onCapture }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const startCamera = async () => {
      try {
        setCameraError(null);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (error) {
        console.error("Camera access failed:", error);

        setCameraError(
          "Camera access was denied or the camera is unavailable."
        );
      }
    };

    startCamera();

    return () => {
      mounted = false;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {cameraError ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-white">
          <div>
            <p className="mb-2 text-lg font-semibold">Camera unavailable</p>
            <p className="text-sm text-gray-300">{cameraError}</p>
          </div>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              Opening camera...
            </div>
          )}

          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
          </div>

          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <button
              type="button"
              onClick={onCapture}
              disabled={!cameraReady}
              className="h-16 w-16 rounded-full border-4 border-white bg-white/20 backdrop-blur disabled:opacity-50"
              aria-label="Scan object"
            >
              <div className="mx-auto h-12 w-12 rounded-full bg-white" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}