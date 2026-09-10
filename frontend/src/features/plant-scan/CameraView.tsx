import { useEffect, useRef, useState } from "react";

interface CameraViewProps {
  onCapture?: (image: Blob) => void;
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

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API is not supported in this browser.");
        }

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

  const captureImage = () => {
    const video = videoRef.current;

    if (!video || !cameraReady) {
      return;
    }

    // Make sure the camera has produced a real frame.
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error("Camera frame is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      console.error("Unable to create canvas context.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("Failed to capture image.");
          return;
        }

        console.log("Captured image:", blob);
        console.log("Image size:", blob.size);
        console.log("Image type:", blob.type);

        onCapture?.(blob);
      },
      "image/jpeg",
      0.9
    );
  };

  if (cameraError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-6 text-center text-white">
        <div>
          <p className="mb-2 text-lg font-semibold">Camera unavailable</p>

          <p className="text-sm text-gray-300">{cameraError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
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

      {/* Scan frame */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
      </div>

      {/* Capture button */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center">
        <button
          type="button"
          onClick={captureImage}
          disabled={!cameraReady}
          className="h-16 w-16 rounded-full border-4 border-white bg-white/20 backdrop-blur disabled:opacity-50"
          aria-label="Capture plant or object"
        >
          <div className="mx-auto h-12 w-12 rounded-full bg-white" />
        </button>
      </div>
    </div>
  );
}