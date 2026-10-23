// @ts-nocheck
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { getDashboardUploadsHistory } from "../../api";
import { formatDate } from "@/utils/formatDate";

// Read-only history of finished uploads (GET /dashboard/uploads/history) — who sees what is
// decided server-side, so this just renders whatever comes back. Refetches whenever the modal
// opens and on every "upload" SSE event while it's open, same as the live queue does.
export default function UploadHistoryPanel({ open, onOpenChange, onOpenDetail, refreshSignal }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getDashboardUploadsHistory()
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, refreshSignal]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload History</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center">
            No finished uploads yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-0.5 rounded-md border border-border/50 bg-muted/10 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground truncate" title={item.filename}>
                    {item.filename}
                  </span>
                  {item.updated_at && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDate(item.updated_at)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {item.uploaded_by && <span>Uploaded by: {item.uploaded_by}</span>}
                  {item.approved_by_approver && <span>Approved by: {item.approved_by_approver}</span>}
                  {item.approved_by_admin && <span>Approved by (admin): {item.approved_by_admin}</span>}
                </div>
                {item.created_document_id && (
                  <button
                    type="button"
                    className="self-start text-[11px] text-primary hover:underline cursor-pointer"
                    onClick={() => onOpenDetail(item.created_document_id)}
                  >
                    {item.created_document_id}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
