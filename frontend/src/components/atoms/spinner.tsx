import React from "react";
import { Hatch, Reuleaux } from "ldrs/react";
import "ldrs/react/Reuleaux.css";

export default function ReuleauxLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-white/20 backdrop-blur-sm">
<Hatch
        size="90"
        stroke="6"
        speed="3.5"
        color="black"
      />
    </div>
  );
}
