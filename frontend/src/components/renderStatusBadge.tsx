import { Badge } from "@/components/atoms/badge";

export function renderStatusBadge(status: string) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        NIL
      </Badge>
    );
  }

  const formatted = status.replace("_", " ");

  const colorClass =
    status === "in-review"
      ? "bg-green-500/10 text-green-600 border-green-500/30"
      : status === "open"
      ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
      : status === "closed"
      ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
      : "bg-muted text-foreground";

  return (
    <Badge variant="outline" className={colorClass}>
      {formatted}
    </Badge>
  );
}
