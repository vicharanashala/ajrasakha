import { Badge } from "./components/shared/Badge";
import { DASHBOARD_DATA } from "./mockData";

interface Alert {
  id: number;
  level: "critical" | "warn" | "info";
  title: string;
  desc: string;
}

function AlertItem({ level, title, desc }: Omit<Alert, "id">) {
  const getAlertClasses = (alertLevel: string) => {
    switch (alertLevel) {
      case "critical":
        return "bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500";
      case "warn":
        return "bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500";
      case "info":
        return "bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500";
      default:
        return "";
    }
  };

  return (
    <div className={`${getAlertClasses(level)} rounded-lg p-2.5 mb-2.5`}>
      <div className="text-xs font-medium text-gray-900 dark:text-gray-50">
        {title}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-tight">
        {desc}
      </div>
    </div>
  );
}

export function AlertCard() {
  const alerts: Alert[] = DASHBOARD_DATA.alerts;
  
  // Sort alerts by priority: critical > warn > info
  const priorityOrder = { critical: 0, warn: 1, info: 2 };
  const sortedAlerts = [...alerts].sort(
    (a, b) => priorityOrder[a.level] - priorityOrder[b.level]
  );
  
  const criticalCount = sortedAlerts.filter((a) => a.level === "critical").length;

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--card-foreground)" }}>Active alerts</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>Requires leadership action</div>
        </div>
        <Badge label={`${criticalCount} critical`} variant="red" />
      </div>
      <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: 260 }}>
        {sortedAlerts.map((a) => (
          <AlertItem
            key={a.id}
            level={a.level}
            title={a.title}
            desc={a.desc}
          />
        ))}
      </div>
    </div>
  );
}
