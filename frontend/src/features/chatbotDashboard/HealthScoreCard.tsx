import { Card } from "./components/shared/Card";

interface HealthPillar { label: string; score: number; color: string; }

export function HealthScoreCard({ pillars }: { pillars: HealthPillar[] }) {
  return (
    
        // Remove this div when data is dynamic
    <div className="relative">
    <Card title="Platform health score" subtitle="Six-pillar composite · weekly">
      <div className="max-h-[280px] overflow-y-auto pr-1">
        <div className="flex justify-end mb-3">
          <div className="text-right">
            <div className="text-2xl font-medium text-green-700 leading-none">70</div>
            <div className="text-xs text-amber-700 font-medium">MODERATE</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
          {pillars.map(p => (
            <div key={p.label} className="border border-border rounded-lg p-3 text-center bg-muted">
              <div className={`text-xl font-medium ${p.score >= 75 ? 'text-green-700' : 'text-amber-800'}`}>{p.score}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{p.label}</div>
              <div className="h-1 rounded-sm bg-border mt-1.5 overflow-hidden">
                <div className="h-full rounded-sm transition-all duration-700 ease-in-out" style={{ width: `${p.score}%`, background: p.color }} />
              </div>
            </div>
          ))}
        </div>
        <div className="p-2.5 bg-amber-50 rounded-lg text-xs text-amber-800">
          <span className="font-medium">Action needed:</span> Geo reach + Retention below 65 — assign sprint owners this week
        </div>
      </div>
    </Card>
    
        {/* // Remove this div when data is dynamic */}
    <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] rounded-lg flex items-center justify-center z-10">
				<span className="text-white text-xs font-semibold tracking-wide">
					DEMO DATA
				</span>
				</div>
    </div>
  );
}