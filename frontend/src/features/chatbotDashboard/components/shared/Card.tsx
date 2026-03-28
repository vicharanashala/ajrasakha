import { ReactNode } from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Card({ title, subtitle, action, children }: CardProps) {
  return (
    <div style={{ background: "var(--card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ minWidth: 0, flex: 1, marginRight: action ? 8 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--card-foreground)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action && <span style={{ fontSize: 11, color: "#3AAA5A", cursor: "pointer", whiteSpace: "nowrap" }}>{action}</span>}
      </div>
      {children}
    </div>
  );
}
