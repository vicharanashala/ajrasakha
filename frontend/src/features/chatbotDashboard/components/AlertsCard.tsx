import { Card } from "./shared/Card";
import { Badge } from "./shared/Badge";

interface Alert { id: number; level: "critical" | "warn" | "info"; title: string; desc: string; }

const alertStyles = {
  critical: { bg: "rgba(226,75,74,0.1)",  border: "#E24B4A" },
  warn:     { bg: "rgba(239,159,39,0.1)", border: "#EF9F27" },
  info:     { bg: "rgba(61,141,224,0.1)", border: "#3D8DE0" },
};

function AlertItem({ level, title, desc }: Omit<Alert, "id">) {
  const s = alertStyles[level];
  return (
    <div style={{ background: s.bg, borderLeft: `3px solid ${s.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 7 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--card-foreground)" }}>{title}</div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

export function AlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <Card title="Active alerts" subtitle="Requires leadership action" action={<Badge label="3 critical" variant="red" />}>
      {alerts.map(a => <AlertItem key={a.id} level={a.level} title={a.title} desc={a.desc} />)}
    </Card>
  );
}
