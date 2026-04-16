import { Badge } from "./components/shared/Badge";

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

export function AlertCard({ alerts = [] }: { alerts?: Alert[] }) {
  
  // Sort alerts by priority: critical > warn > info
  const priorityOrder = { critical: 0, warn: 1, info: 2 };
  const sortedAlerts = [...alerts].sort(
    (a, b) => priorityOrder[a.level] - priorityOrder[b.level]
  );
  
  const criticalCount = sortedAlerts.filter((a) => a.level === "critical").length;

  return (
    <div className="h-full flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-start justify-between mb-3.5">
        <div className="min-w-0 flex-1 mr-2">
          <div className="text-[13px] font-medium text-[var(--card-foreground)]">Active alerts</div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">Requires leadership action</div>
        </div>
        <Badge label={`${criticalCount} critical`} variant="red" />
      </div>
      <div className="flex-1 overflow-y-auto pr-1 max-h-[260px]">
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
