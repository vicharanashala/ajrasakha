
import type { Column } from "../baseTable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { truncate } from "../../helper";
import { renderStatusBadge } from "@/components/renderStatusBadge";
import { renderLevelBadge } from "./RenderLevelBadge";

export type ReviewRow = {
  _id:string
  question: string;
  status:string
  levels: (
    | "NA"
    | {
        time: string;
        yet_to_complete: boolean;
      }
  )[];
  sortable?: boolean;
};

export const reviewLevelColumns = (
  onViewMore: (id: string) => void,
  visibleColumns: Record<string, boolean>
): Column<ReviewRow>[] => {
  const baseColumns: Column<ReviewRow>[] = [
  { key: "sl_No", label: "Sl.No", width: "80px", render: (_row, i) => i + 1 },
  {
  key: "question",
  label: "Question",
  width: "28%",
  render: (row) => (
    <div className="text-left">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="block cursor-pointer hover:underline"
            onClick={() => onViewMore(row._id)}
          >
            {truncate(row.question, 50)}
          </span>
        </TooltipTrigger>

        <TooltipContent side="top" className="max-w-sm">
          {row.question}
        </TooltipContent>
      </Tooltip>
    </div>
  ),
},
{
  key: "status",
  label: "Status",
  width: "8%",
  render: (row) => renderStatusBadge(row.status),
}
,

  ...Array.from({ length: 10 }).map((_, i) => ({
    key: i===0 ? 'author' : `level_${i}`,
    label: i ===0 ? 'Author' : `Level ${i}`,
    sortable: true,
    render: (row: ReviewRow) => renderLevelBadge(row, i),
  }))
]
 return baseColumns.filter(
    (col) => visibleColumns[col.key] !== false
  );
}