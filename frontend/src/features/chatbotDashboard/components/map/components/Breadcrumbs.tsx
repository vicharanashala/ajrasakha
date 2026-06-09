/* ============================================================
   BREADCRUMBS - Navigation breadcrumb component
============================================================ */

import { ArrowLeft, ChevronRight } from "lucide-react";
import type { Crumb, LevelKey } from "../lib/types";

interface BreadcrumbsProps {
  crumbs: Crumb[];
  currentLevel: LevelKey;
  onNavigate: (index: number) => void;
}

export function Breadcrumbs({ crumbs, currentLevel, onNavigate }: BreadcrumbsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {currentLevel !== "india" && (
        <button
          onClick={() => onNavigate(currentLevel === "state" ? 0 : 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      )}
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <button
              onClick={() => onNavigate(i)}
              disabled={i === crumbs.length - 1}
              className={
                i === crumbs.length - 1
                  ? "rounded-md bg-primary px-2 py-0.5 text-primary-foreground"
                  : "rounded-md px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              }
            >
              {c.name}
            </button>
          </span>
        ))}
      </nav>
    </div>
  );
}