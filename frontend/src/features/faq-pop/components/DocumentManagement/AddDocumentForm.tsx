// @ts-nocheck
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  getDashboardStates,
  getDashboardCrops,
  getDashboardLanguages,
  createDashboardState,
  createDashboardCrop,
  uploadDashboardDocument,
} from "../../api";
import { MultiSelector, StateSelector } from "../FunctionsPanel/RunTile";
import { DOCUMENT_METADATA_FIELDS } from "./fields";
import MetadataFieldInput from "./MetadataFieldInput";

const inputClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
const labelClass = "text-xs font-medium text-foreground/70";

function emptyValues() {
  const v = {};
  for (const f of DOCUMENT_METADATA_FIELDS) v[f.key] = "";
  return v;
}

let _groupSeq = 0;
function emptyGroup() {
  return { key: ++_groupSeq, state: "", crops: [] };
}

// Add Document — required: file, language, at least one state with at least one crop. Placements
// are per-state crop groups (docs/first_render_frontend.md): a state, that state's crops, then
// another state — sent as placements_json: [{state, crops: [...]}, ...]. Defaults to one group so
// the common single-state case looks the same as before; "add another state" appends more.
export default function AddDocumentForm({ onUploadQueued }) {
  const [values, setValues] = useState(emptyValues);
  const [file, setFile] = useState(null);
  const [groups, setGroups] = useState(() => [emptyGroup()]);
  const [language, setLanguage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [stateOptions, setStateOptions] = useState([]);
  const [cropOptions, setCropOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [newCrop, setNewCrop] = useState("");
  const [addingCrop, setAddingCrop] = useState(false);
  const [newState, setNewState] = useState("");
  const [addingState, setAddingState] = useState(false);

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

  function updateGroup(key, patch) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  }
  function addGroup() {
    setGroups((prev) => [...prev, emptyGroup()]);
  }
  function removeGroup(key) {
    setGroups((prev) => (prev.length > 1 ? prev.filter((g) => g.key !== key) : prev));
  }

  async function handleAddCrop() {
    if (!newCrop.trim()) return;
    setAddingCrop(true);
    try {
      await createDashboardCrop(newCrop.trim());
      setCropOptions((prev) => [...new Set([...prev, newCrop.trim()])].sort());
      setNewCrop("");
    } catch (err) {
      toast.error(err.message || "Failed to add crop");
    } finally {
      setAddingCrop(false);
    }
  }

  async function handleAddState() {
    if (!newState.trim()) return;
    setAddingState(true);
    try {
      await createDashboardState(newState.trim());
      setStateOptions((prev) => [...new Set([...prev, newState.trim()])].sort());
      setNewState("");
    } catch (err) {
      toast.error(err.message || "Failed to add state");
    } finally {
      setAddingState(false);
    }
  }

  async function handleSubmit() {
    if (!file) {
      toast.error("Choose a PDF file first");
      return;
    }
    const placements = groups
      .filter((g) => g.state && g.crops.length > 0)
      .map((g) => ({ state: g.state, crops: g.crops }));
    if (placements.length === 0) {
      toast.error("Select at least one state with at least one crop");
      return;
    }
    if (!language) {
      toast.error("Select a language");
      return;
    }
    // month_of_*/year_of_* aren't form fields anymore (see fields.ts) but are still real,
    // separately-filterable backend fields — derive them from the date whenever one was entered,
    // same as UniqueDocumentEditForm's handleSave.
    const fields = { ...values };
    if (fields.date_of_release) {
      const [y, m] = fields.date_of_release.split("-");
      fields.month_of_release = m;
      fields.year_of_release = y;
    }
    if (fields.date_of_collection) {
      const [y, m] = fields.date_of_collection.split("-");
      fields.month_of_collection = m;
      fields.year_of_collection = y;
    }
    setSubmitting(true);
    try {
      const result = await uploadDashboardDocument(file, fields, placements, language);
      toast.success("Upload queued");
      setValues(emptyValues());
      setFile(null);
      setGroups([emptyGroup()]);
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
          Upload a PDF and tag it with one or more state/crop placements and metadata.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DOCUMENT_METADATA_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className={labelClass}>{f.label}</label>
            <MetadataFieldInput
              field={f}
              value={values[f.key]}
              onChange={(v) => setValue(f.key, v)}
              className={inputClass}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 border-t border-border/50 pt-4">
        <label className={labelClass}>Language</label>
        <select
          className={`${inputClass} sm:max-w-xs`}
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

      <div className="flex flex-col gap-3 border-t border-border/50 pt-4">
        <div className="flex items-center justify-between">
          <label className={labelClass}>Placements (state → crops)</label>
          <button
            className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
            onClick={addGroup}
          >
            <Plus size={11} /> Add another state
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.key} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start rounded-md border border-border/50 p-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">State</span>
              <StateSelector
                value={g.state}
                onChange={(v) => updateGroup(g.key, { state: v })}
                stateNames={stateOptions}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">Crop(s)</span>
              <MultiSelector
                value={g.crops}
                onChange={(v) => updateGroup(g.key, { crops: v })}
                names={cropOptions}
                placeholder="Select crops…"
              />
            </div>
            {groups.length > 1 && (
              <button
                className="self-start mt-4 p-1 rounded border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors cursor-pointer"
                onClick={() => removeGroup(g.key)}
                title="Remove this state"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              className={`${inputClass} flex-1`}
              placeholder="Add new state…"
              value={newState}
              onChange={(e) => setNewState(e.target.value)}
            />
            <button
              className="px-2.5 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleAddState}
              disabled={addingState || !newState.trim()}
            >
              {addingState ? "Adding…" : "Add"}
            </button>
          </div>
          <div className="flex items-center gap-1.5">
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
