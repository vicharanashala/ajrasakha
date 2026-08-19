/* ============================================================
   MAP LEGEND - Color scale legend for map visualization
============================================================ */
// import { fmt } from "../lib/formatters";

// interface MapLegendProps {
//   minV: number;
//   maxV: number;
//   isIndiaView?: boolean;
//   metric?: "users" | "activeUsers" | "questions" | "feedback";
// }

// export function MapLegend({
//   minV,
//   maxV,
//   isIndiaView,
//   metric = "questions",
// }: MapLegendProps) {
//   const useLogScale =
//     metric === "users" ||
//     metric === "activeUsers" ||
//     metric === "feedback";

//   let redEnd: number;
//   let orangeEnd: number;

//   if (useLogScale) {
//     const logMin = Math.log1p(minV);
//     const logMax = Math.log1p(maxV);

//     redEnd = Math.round(
//       Math.expm1(logMin + (logMax - logMin) / 3),
//     );

//     orangeEnd = Math.round(
//       Math.expm1(logMin + (2 * (logMax - logMin)) / 3),
//     );
//   } else {
//     const range = maxV - minV;

//     redEnd = Math.round(minV + range / 3);

//     orangeEnd = Math.round(minV + (2 * range) / 3);
//   }

//   return (
//     <div className="pointer-events-none absolute bottom-3 left-3 z-[400] w-64 rounded-xl border border-border bg-card/95 p-3 text-xs shadow backdrop-blur">
//   <div className="mb-2 font-medium text-foreground capitalize">
//     {isIndiaView
//       ? `State Activity Based On ${metric}`
//       : `District Activity Based On ${metric}`}
//   </div>

//   {useLogScale && (
//     <div className="mb-2 text-[10px] text-muted-foreground">
//       Logarithmic scale
//     </div>
//   )}

//   {/* Color Scale */}
//   <div className="overflow-hidden rounded-md border border-border">
//     <div className="flex h-3">
//       <div className="flex-1 bg-red-600" />
//       <div className="flex-1 bg-orange-500" />
//       <div className="flex-1 bg-green-600" />
//     </div>

//     {/* Breakup directly below the colors */}
//     <div className="grid grid-cols-3 border-t border-border bg-muted/20 text-[10px]">
//       <div className="px-1 py-2 text-center">
//         <div className="font-medium">Bottom</div>
//         <div className="text-muted-foreground">
//           {fmt(minV)} – {fmt(redEnd)}
//         </div>
//       </div>

//       <div className="border-x border-border px-1 py-2 text-center">
//         <div className="font-medium">Middle</div>
//         <div className="text-muted-foreground">
//           {fmt(redEnd + 1)} – {fmt(orangeEnd)}
//         </div>
//       </div>

//       <div className="px-1 py-2 text-center">
//         <div className="font-medium">Top</div>
//         <div className="text-muted-foreground">
//           {fmt(orangeEnd + 1)} – {fmt(maxV)}
//         </div>
//       </div>
//     </div>
//   </div>

//   {/* Overall scale */}
//   <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
//     <span>{fmt(minV)}</span>
//     <span>{fmt(maxV)}</span>
//   </div>
// </div>
//   );
// }

import { fmt } from "../lib/formatters";

interface MapLegendProps {
  minV: number;
  maxV: number;
  isIndiaView?: boolean;
  metric?: "users" | "activeUsers" | "questions" | "feedback";
}

export function MapLegend({
  minV,
  maxV,
  isIndiaView,
  metric = "questions",
}: MapLegendProps) {
  const useLogScale =
    metric === "users" ||
    metric === "activeUsers" ||
    metric === "feedback";

  let redEnd: number;
  let orangeEnd: number;

  if (metric === "questions") {
    if (isIndiaView) {
      // India View
      // Bottom bucket is always 0-50
      redEnd = 50;

      // Split the remaining range equally
      orangeEnd = Math.round(redEnd + (maxV - redEnd) / 2);
    } else {
      // State/District View
      // Keep existing implementation
      const range = maxV - minV;

      redEnd = Math.round(minV + range / 3);
      orangeEnd = Math.round(minV + (2 * range) / 3);
    }
  } else if (useLogScale) {
    const logMin = Math.log1p(minV);
    const logMax = Math.log1p(maxV);

    redEnd = Math.round(
      Math.expm1(logMin + (logMax - logMin) / 3),
    );

    orangeEnd = Math.round(
      Math.expm1(logMin + (2 * (logMax - logMin)) / 3),
    );
  } else {
    const range = maxV - minV;

    redEnd = Math.round(minV + range / 3);
    orangeEnd = Math.round(minV + (2 * range) / 3);
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[400] w-64 rounded-xl border border-border bg-card/95 p-3 text-xs shadow backdrop-blur">
      <div className="mb-2 font-medium text-foreground capitalize">
        {isIndiaView
          ? `State Activity Based On ${metric}`
          : `District Activity Based On ${metric}`}
      </div>

      {useLogScale && (
        <div className="mb-2 text-[10px] text-muted-foreground">
          Logarithmic scale
        </div>
      )}

      {/* Color Scale */}
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex h-3">
          <div className="flex-1 bg-red-600" />
          <div className="flex-1 bg-orange-500" />
          <div className="flex-1 bg-green-600" />
        </div>

        {/* Breakup */}
        <div className="grid grid-cols-3 border-t border-border bg-muted/20 text-[10px]">
          <div className="px-1 py-2 text-center">
            <div className="font-medium">Bottom</div>
            <div className="text-muted-foreground">
              {metric === "questions" && isIndiaView
                ? `0 – ${fmt(redEnd)}`
                : `${fmt(minV)} – ${fmt(redEnd)}`}
            </div>
          </div>

          <div className="border-x border-border px-1 py-2 text-center">
            <div className="font-medium">Middle</div>
            <div className="text-muted-foreground">
              {fmt(redEnd + 1)} – {fmt(orangeEnd)}
            </div>
          </div>

          <div className="px-1 py-2 text-center">
            <div className="font-medium">Top</div>
            <div className="text-muted-foreground">
              {fmt(orangeEnd + 1)} – {fmt(maxV)}
            </div>
          </div>
        </div>
      </div>

      {/* Overall Scale */}
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {metric === "questions" && isIndiaView
            ? "0"
            : fmt(minV)}
        </span>
        <span>{fmt(maxV)}</span>
      </div>
    </div>
  );
}