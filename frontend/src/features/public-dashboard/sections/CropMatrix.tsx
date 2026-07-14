import { useMemo } from "react";
import { SectionHead } from "../components/SectionHead";
import { crops, states } from "../data/dashboardData";

/** State × crop saturation heat-map. Demo fill until per-crop coverage is exposed by the API. */
export const CropMatrix = () => {
  const matrixStates = states.slice(0, 8).map((s) => s.name);
  const matrixCrops = crops.map((c) => c.name);

  // Compute saturation once so it stays stable across re-renders.
  const cells = useMemo(
    () => matrixStates.map(() => matrixCrops.map(() => Math.round(40 + Math.random() * 58))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <section className="wrap" id="matrix">
      <SectionHead num="COVERAGE" title="National Crop Coverage Matrix" />
      <p className="sec-desc">
        Saturation maturity by state and crop — darker fill indicates a more complete
        validated knowledge base.
      </p>
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th>State</th>
              {matrixCrops.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixStates.map((sName, r) => (
              <tr key={sName}>
                <td>{sName}</td>
                {matrixCrops.map((c, ci) => {
                  const v = cells[r][ci];
                  const alpha = (v / 100) * 0.85 + 0.1;
                  return (
                    <td
                      key={c}
                      style={{
                        background: `rgba(31,110,69,${alpha.toFixed(2)})`,
                        color: v > 60 ? "#fff" : "#1a1a1a",
                      }}
                    >
                      {v}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
