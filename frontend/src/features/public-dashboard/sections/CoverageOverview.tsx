import { DistributionDoughnut } from "../components/charts";
import { SectionHead } from "../components/SectionHead";
import { cropColors, domainColors } from "../data/dashboardData";

/**
 * Replaces the old "National Mission Snapshot" stat grid. Two doughnuts side by side —
 * crops (left) and domains (right) — each showing its distribution, with the TOTAL covered
 * in the centre. The per-slice count/percentage is intentionally hidden; the legend is just
 * the names, and the headline figure is "how many crops / domains are covered".
 *
 * Keeps id="layer1" so the "Snapshot" nav link still scrolls here.
 */
export const CoverageOverview = ({
  cropData,
  domainData,
  cropsCovered,
  domainsCovered,
}: {
  cropData: { label: string; value: number }[];
  domainData: { label: string; value: number }[];
  cropsCovered?: number;
  domainsCovered?: number;
}) => (
  <section className="wrap" id="layer1">
    <SectionHead title="Crop & Domain Coverage" />
    <p className="sec-desc">
      The breadth of the validated knowledge base — how many crops and agronomy domains
      questions have been collected across.
    </p>

    <div className="two-col">
      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 10 }}>Crops</h4>
        <DistributionDoughnut
          data={cropData}
          colors={cropColors}
          showMeta={false}
          centerValue={cropsCovered ?? cropData.length}
          centerLabel="Total crops covered"
        />
      </div>

      <div className="chart-box">
        <h4 style={{ fontSize: 16, marginBottom: 10 }}>Domains</h4>
        <DistributionDoughnut
          data={domainData}
          colors={domainColors}
          showMeta={false}
          centerValue={domainsCovered ?? domainData.length}
          centerLabel="Total domains covered"
        />
      </div>
    </div>
  </section>
);
