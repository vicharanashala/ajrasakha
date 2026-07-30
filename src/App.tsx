import { useState } from "react";
import { Sprout } from "lucide-react";
import KpiBar from "./components/KpiBar";
import DiagnosisLegend from "./components/DiagnosisLegend";
import CoverageHeatmap from "./components/CoverageHeatmap";
import PriorityQueue from "./components/PriorityQueue";
import ClusterDrawer from "./components/ClusterDrawer";
import { useGapData, useClusterDetail } from "./hooks/useGapData";

export default function App() {
  const { kpis, clusters, isLoading } = useGapData();
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const selectedCluster = useClusterDetail(selectedClusterId);

  return (
    <div className="min-h-screen" style={{ background: "var(--color-background)" }}>
      {/* Top nav */}
      <header
        className="sticky top-0 z-30 px-6 lg:px-10 py-4 flex items-center justify-between"
        style={{
          background: "oklch(0.145 0.008 260 / 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <Sprout className="w-6 h-6" style={{ color: "var(--color-accent)" }} />
          <div>
            <h1 className="text-sm font-bold font-[family-name:var(--font-heading)] tracking-tight" style={{ color: "var(--color-foreground)" }}>
              GDB Coverage Debt Radar
            </h1>
            <p className="text-[10px]" style={{ color: "oklch(0.5 0.01 260)" }}>
              Gap Discovery Bot · Weekly Analysis
            </p>
          </div>
        </div>
        {kpis && (
          <span className="text-[10px]" style={{ color: "oklch(0.45 0.02 260)" }}>
            Last updated: {new Date(kpis.last_updated).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </header>

      {/* Main content */}
      <main className="px-6 lg:px-10 py-6 max-w-[1440px] mx-auto space-y-6">
        {/* KPI Bar */}
        <section>
          <KpiBar kpis={kpis} isLoading={isLoading} />
        </section>

        {/* Diagnosis Legend */}
        <section>
          <DiagnosisLegend />
        </section>

        {/* Heatmap */}
        <section>
          <CoverageHeatmap clusters={clusters} isLoading={isLoading} />
        </section>

        {/* Priority Queue */}
        <section>
          <PriorityQueue
            clusters={clusters}
            isLoading={isLoading}
            onSelectCluster={setSelectedClusterId}
            selectedClusterId={selectedClusterId}
          />
        </section>

        {/* Footer */}
        <footer className="text-center py-4">
          <p className="text-[10px]" style={{ color: "oklch(0.38 0.02 260)" }}>
            NativelyAI Demo · Coverage Debt Radar · Mock data for evaluation
          </p>
        </footer>
      </main>

      {/* Cluster Detail Drawer */}
      <ClusterDrawer
        cluster={selectedCluster}
        onClose={() => setSelectedClusterId(null)}
      />
    </div>
  );
}
