// @ts-nocheck
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/atoms/alert-dialog";
import { updateDashboardUniqueDocument } from "../../api";
import { DOCUMENT_METADATA_FIELDS } from "./fields";

const inputClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
const labelClass = "text-xs font-medium text-foreground/70";

// Full metadata edit form (spec §3.2) — the only place these fields can be edited. Hosted in an
// AlertDialog since it needs a form body rather than a confirm/cancel shape (ConfirmationModal
// doesn't fit); modeled on the same atoms/alert-dialog primitives ConfirmationModal itself wraps.
export default function UniqueDocumentEditForm({ doc, open, onOpenChange, onSaved }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of DOCUMENT_METADATA_FIELDS) v[f.key] = doc?.[f.key] ?? "";
    return v;
  });
  const [saving, setSaving] = useState(false);

  function setValue(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    // Every field is optional (str | None / int | None) — an empty string must become null
    // rather than being sent as "" (a number field would 422 on an empty string).
    const payload = {};
    for (const f of DOCUMENT_METADATA_FIELDS) {
      const raw = values[f.key];
      if (raw === "" || raw == null) {
        payload[f.key] = null;
      } else {
        payload[f.key] = f.type === "number" ? Number(raw) : raw;
      }
    }
    setSaving(true);
    try {
      const updated = await updateDashboardUniqueDocument(doc.id, payload);
      toast.success("Document updated");
      onSaved?.(updated);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Edit Document</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          {DOCUMENT_METADATA_FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className={labelClass}>{f.label}</label>
              <input
                type={f.type === "number" ? "number" : "text"}
                className={inputClass}
                value={values[f.key]}
                onChange={(e) => setValue(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <button
            className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-accent transition-colors cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
