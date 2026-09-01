import CameraView from "./CameraView";

export default function PlantScanPage() {
  const handleScan = () => {
    console.log("Scan button pressed");
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <CameraView onCapture={handleScan} />

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-5 text-white">
        <h1 className="text-xl font-semibold">AjraSakha Scan</h1>

        <p className="mt-1 text-sm text-white/80">
          Point your camera at a plant, leaf, crop, or object.
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-28 left-0 right-0 z-10 text-center text-sm text-white">
        Tap the scan button to identify an object
      </div>
    </div>
  );
}