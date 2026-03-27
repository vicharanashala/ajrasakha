const badgeStyles: Record<string, { background: string; color: string }> = {
  green: { background: "#EAF3DE", color: "#3B6D11" },
  red:   { background: "#FCEBEB", color: "#A32D2D" },
  amber: { background: "#FAEEDA", color: "#633806" },
  blue:  { background: "#E6F1FB", color: "#0C447C" },
};

interface BadgeProps {
  label: string;
  variant?: "green" | "red" | "amber" | "blue";
}

export function Badge({ label, variant = "green" }: BadgeProps) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 500, ...badgeStyles[variant] }}>
      {label}
    </span>
  );
}
