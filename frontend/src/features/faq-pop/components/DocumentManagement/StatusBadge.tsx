// @ts-nocheck
const STYLES = {
  done: "text-green-400 border-green-500/30 bg-green-500/5",
  in_progress: "text-blue-400 border-blue-500/30 bg-blue-500/5",
  not_started: "text-muted-foreground border-border/50 bg-transparent",
};

const LABELS = {
  done: "Done",
  in_progress: "In progress",
  not_started: "Not started",
};

export default function StatusBadge({ status }) {
  const key = status && STYLES[status] ? status : "not_started";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${STYLES[key]}`}
    >
      {key === "in_progress" && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      )}
      {LABELS[key]}
    </span>
  );
}
