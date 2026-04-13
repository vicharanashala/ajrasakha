import { ReactNode } from "react";

interface CardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Card({ title, subtitle, action, children }: CardProps) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex flex-col">
      <div className="flex items-start justify-between mb-[14px]">
        <div className={`min-w-0 flex-1 ${action ? "mr-2" : ""}`}>
          <div className="text-[13px] font-medium text-[var(--card-foreground)]">{title}</div>
          {subtitle && <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{subtitle}</div>}
        </div>
        {action && <span className="text-[11px] text-[#3AAA5A] cursor-pointer whitespace-nowrap">{action}</span>}
      </div>
      {children}
    </div>
  );
}
