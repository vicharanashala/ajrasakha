import { useState } from "react";
import { History } from "lucide-react";
import { AuditTrailModal } from "@/features/question_details/components/AuditTrailModal";
import type { ICropResponse } from "@/hooks/services/cropService";

/**
 * Audit-trail trigger for a crop row — opens the shared AuditTrailModal (same UI as the
 * question audit trail) scoped to this crop.
 */
export const CropAuditTrailModal = ({ crop }: { crop: ICropResponse }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Audit trail"
        className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all"
      >
        <History className="h-3.5 w-3.5" />
      </button>

      {open && crop._id && (
        <AuditTrailModal
          open={open}
          onClose={() => setOpen(false)}
          cropId={crop._id}
          entityLabel="AgriTech"
        />
      )}
    </>
  );
};
