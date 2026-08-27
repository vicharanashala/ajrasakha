// @ts-nocheck
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getDashboardStates,
  getDashboardCrops,
  getDashboardLanguages,
  createDashboardCrop,
  uploadDashboardDocument,
} from "../../api";
import { MultiSelector, StateSelector } from "../FunctionsPanel/RunTile";
import { DOCUMENT_METADATA_FIELDS } from "./fields";

const inputClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
const labelClass = "text-xs font-medium text-foreground/70";

function emptyValues() {
  const v = {};
  for (const f of DOCUMENT_METADATA_FIELDS) v[f.key] = "";
  return v;
}

// Add Document mode (spec §4.1) — form for manual metadata + file upload. Backend API changes
// (2026-08-24 round 2): an upload is tagged to exactly ONE state now (was multi-select) — crops
// stay multi-select. (2026-08-26 round 5): Language is a required, explicit field — not inferred
// from State — sourced only from GET /dashboard/languages. The Upload Queue / Translation Queue
// panels render separately, to the right of this form (see DocumentManagementPanel.tsx), not
// below it.
export default function AddDocumentForm({ onUploadQueued }) {
  const [values, setValues] = useState(emptyValues);
  const [file, setFile] = useState(null);
  const [state, setState] = useState("");
  const [crops, setCrops] = useState([]);
  const [language, setLanguage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [stateOptions, setStateOptions] = useState([]);
  const [cropOptions, setCropOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [newCrop, setNewCrop] = useState("");
  const [addingCrop, setAddingCrop] = useState(false);

  useEffect(() => {
    getDashboardStates()
      .then((d) => setStateOptions((d || []).map((s) => s.name)))
      .catch(() => {});
    getDashboardCrops()
      .then((d) => setCropOptions((d || []).map((c) => c.name)))
      .catch(() => {});
    getDashboardLanguages()
      .then((d) => setLanguageOptions(d || []))
      .catch(() => {});
  }, []);

  function setValue(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleAddCrop() {
    if (!newCrop.trim()) return;
    setAddingCrop(true);
    try {
      await createDashboardCrop(newCrop.trim());
      setCropOptions((prev) => [...new Set([...prev, newCrop.trim()])].sort());
      setCrops((prev) => [...prev, newCrop.trim()]);
      setNewCrop("");
    } catch (err) {
      toast.error(err.message || "Failed to add crop");
    } finally {
      setAddingCrop(false);
    }
  }

  async function handleSubmit() {
    if (!file) {
      toast.error("Choose a PDF file first");
      return;
    }
    if (!state) {
      toast.error("Select a state");
      return;
    }
    if (crops.length === 0) {
      toast.error("Select at least one crop");
      return;
    }
    if (!language) {
      toast.error("Select a language");
      return;
    }
    setSubmitting(true);
    try {
      const result = await uploadDashboardDocument(file, values, state, crops, language);
      toast.success("Upload queued");
      setValues(emptyValues());
      setFile(null);
      setState("");
      setCrops([]);
      setLanguage("");
      onUploadQueued?.(result);
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm p-5 flex flex-col gap-4 h-fit">
      <div>
        <h2 className="text-base font-semibold text-foreground">Add Document</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Upload a PDF and tag it with a state, crop(s), and metadata.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border/50 pt-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>State</label>
          <StateSelector value={state} onChange={setState} stateNames={stateOptions} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Language</label>
          <select
            className={inputClass}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="">Select language…</option>
            {languageOptions.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Crop(s)</label>
          <MultiSelector value={crops} onChange={setCrops} names={cropOptions} placeholder="Select crops…" />
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder="Add new crop…"
              value={newCrop}
              onChange={(e) => setNewCrop(e.target.value)}
            />
            <button
              className="px-2.5 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleAddCrop}
              disabled={addingCrop || !newCrop.trim()}
            >
              {addingCrop ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border/50 pt-4">
        <label className={labelClass}>File (PDF)</label>
        <input
          type="file"
          accept=".pdf"
          className="text-sm text-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:bg-transparent file:text-xs file:text-foreground hover:file:bg-accent file:cursor-pointer cursor-pointer"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>

      <button
        className="mt-1 w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium
          hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? "Uploading…" : "Upload"}
      </button>
    </div>
  );
}
