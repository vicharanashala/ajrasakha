import { Badge } from "@/components/atoms/badge";
import type { Column } from "../baseTable";

export type ReviewRow = {
  question: string;
  levels: (string | number)[];
};

export const reviewLevelColumns: Column<ReviewRow>[] = [
  { key: "sl", label: "Sl.No", width: "80px", render: (_row, i) => i + 1 },

  { key: "question", label: "Question", width: "28%", render: row => row.question },

  // Dynamically render Level 1 → Level 10
  ...Array.from({ length: 10 }).map((_, i) => ({
    key: `level_${i + 1}`,
    label: `Level ${i + 1}`,
    render: (row: ReviewRow) => (
      <Badge variant="outline">{row.levels[i] ?? "-"}</Badge>
    )
  }))
];
