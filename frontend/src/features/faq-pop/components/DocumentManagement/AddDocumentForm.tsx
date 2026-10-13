// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  getDashboardStates,
  getDashboardFolders,
  getDashboardLanguages,
  getDashboardDistricts,
  getDashboardKvks,
  uploadDashboardDocument,
} from "../../api";
import { useAuthStore } from "@/stores/auth-store";
import { MultiSelector, StateSelector } from "../FunctionsPanel/RunTile";
import { DOCUMENT_METADATA_FIELDS, folderDisplayLabel } from "./fields";
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
  return { key: ++_groupSeq, state: "", folders: [] };
}

const selectClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";

// One placement group's row — just state + a Folder multi-select. District/KVK used to live here
// (2026-10-01) but moved to the document itself (2026-10-06, see the form-level comment below) —
// a PoP is written for one place, so storing district/kvk per placement gave one document as many
// districts as it had folders. `folderOptions` is passed down from the form (see below): all
// groups share the SAME options, because Folder options depend only on the form's Advisory Type,
// never on a group's own state (see the form-level comment).
function PlacementGroupRow({ group, folderOptions, stateOptions, onChange, onRemove, removable }) {
  const stateNames = stateOptions.map((s) => s.name);
  const folderLabels = folderOptions.map((f) => folderDisplayLabel(f, folderOptions));

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/50 p-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">State</span>
          <StateSelector value={group.state} onChange={(v) => onChange({ state: v })} stateNames={stateNames} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Folder(s) — crop or organisation</span>
          <MultiSelector
            value={group.folders}
            onChange={(v) => onChange({ folders: v })}
            names={folderLabels}
            placeholder="Select folder(s)…"
          />
        </div>
        {removable && (
          <button
            className="self-start mt-4 p-1 rounded border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors cursor-pointer"
            onClick={onRemove}
            title="Remove this state"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// Add Document — required: file, language, at least one state with at least one folder. Placements
// are per-state folder-groups (docs/first_render_frontend.md): a state, that state's folders
// (crops and/or organisations), then another state — sent as placements_json:
// [{state, crop_ids: [...], organization_ids: [...]}, ...]. Defaults to one group so the common
// single-state case looks the same as before; "add another state" appends more.
//
// "Crop" is "Folder" here (2026-09-15) — a folder is either a crop (read-only, from a crop master
// another app maintains — no add-crop UI anymore, POST /crops 403s) or an organisation (ours,
// created inline same as a state). Which folders are offered depends ONLY on this form's own
// Advisory Type field — NOT on any group's state. Backend's explicit correction: `?state=` on
// /folders (and /crops, /organizations) returns only folders already USED under that state, and
// since crops can no longer be created, state-scoping the picker would make a real master crop
// nobody has filed in that state yet permanently unreachable from this form. So there is one
// shared `folderOptions` fetch below, keyed only on values.advisory_type, passed to every group.
export default function AddDocumentForm({ onUploadQueued }) {
  const [values, setValues] = useState(emptyValues);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [groups, setGroups] = useState(() => [emptyGroup()]);
  const [language, setLanguage] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [kvkId, setKvkId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [stateOptions, setStateOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [folderOptions, setFolderOptions] = useState([]);
  // /api/pop has no auth, so the backend just stores whatever name it's sent, unverified — per the
  // user's decision (same as translated_by/reviewed_by, see TranslateReviewCell.tsx), uploaded_by
  // is always the signed-in user's display name, auto-captured on submit. There is no dropdown or
  // free-text entry for it anywhere in this form.
  const currentUserName = useAuthStore((s) => s.user?.name);

  useEffect(() => {
    getDashboardStates()
      .then((d) => setStateOptions(d || []))
      .catch(() => {});
    getDashboardLanguages()
      .then((d) => setLanguageOptions(d || []))
      .catch(() => {});
  }, []);

  function refetchFolders() {
    return getDashboardFolders(values.advisory_type)
      .then((d) => {
        const list = d || [];
        setFolderOptions(list);
        // Drop any group's selected folder that's no longer offered under the new Advisory Type.
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            folders: g.folders.filter((f) => list.some((o) => folderDisplayLabel(o, list) === f)),
          })),
        );
      })
      .catch(() => {});
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    refetchFolders();
  }, [values.advisory_type]);

  // District/KVK (2026-10-06: document-level, not per-placement — see the district_id/kvk_id form
  // fields in handleSubmit below). District's dropdown is scoped by the FIRST placement group's
  // state as a best-effort "which place is this document for" signal — most uploads are single-
  // state anyway, and there's no other state to borrow one from at this point in the form. Each
  // list carries exactly ONE "All" row (2026-10-05 backend change) — a real selectable value kept
  // in the list, distinct from the dropdown's own blank "— none —" option (sends nothing at all).
  const primaryStateId = stateOptions.find((s) => s.name === groups[0]?.state)?.id || "";
  const [districtOptions, setDistrictOptions] = useState([]);
  useEffect(() => {
    if (!primaryStateId) {
      setDistrictOptions([]);
      return;
    }
    getDashboardDistricts(primaryStateId)
      .then((d) => setDistrictOptions(d || []))
      .catch(() => {});
  }, [primaryStateId]);

  const [kvkOptions, setKvkOptions] = useState([]);
  useEffect(() => {
    if (!districtId) {
      setKvkOptions([]);
      return;
    }
    getDashboardKvks(districtId)
      .then((d) => setKvkOptions(d || []))
      .catch(() => {});
  }, [districtId]);

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

  async function handleSubmit() {
    if (!file) {
      toast.error("Choose a PDF file first");
      return;
    }
    const placements = groups
      .filter((g) => g.state && g.folders.length > 0)
      .map((g) => {
        const crop_ids = [];
        const organization_ids = [];
        for (const label of g.folders) {
          const opt = folderOptions.find((f) => folderDisplayLabel(f, folderOptions) === label);
          if (!opt) continue;
          (opt.kind === "organization" ? organization_ids : crop_ids).push(opt.id);
        }
        const stateId = stateOptions.find((s) => s.name === g.state)?.id || "";
        const p = { state_id: stateId };
        if (crop_ids.length) p.crop_ids = crop_ids;
        if (organization_ids.length) p.organization_ids = organization_ids;
        return p;
      })
      .filter((p) => p.crop_ids || p.organization_ids);
    if (placements.length === 0) {
      toast.error("Select at least one state with at least one folder");
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
    if (currentUserName) fields.uploaded_by = currentUserName;
    // District/KVK are form fields of the upload itself now (2026-10-06), not of a placement
    // group — sent alongside language/placements_json (see uploadDashboardDocument in api.ts).
    if (districtId) fields.district_id = districtId;
    if (kvkId) fields.kvk_id = kvkId;
    setSubmitting(true);
    try {
      const result = await uploadDashboardDocument(file, fields, placements, language);
      toast.success("Upload queued");
      setValues(emptyValues());
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setGroups([emptyGroup()]);
      setLanguage("");
      setDistrictId("");
      setKvkId("");
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
          Upload a PDF and tag it with one or more state/folder placements and metadata.
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
          <label className={labelClass}>Placements (state → folder)</label>
          <button
            className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
            onClick={addGroup}
          >
            <Plus size={11} /> Add another state
          </button>
        </div>
        {groups.map((g) => (
          <PlacementGroupRow
            key={g.key}
            group={g}
            folderOptions={folderOptions}
            stateOptions={stateOptions}
            onChange={(patch) => updateGroup(g.key, patch)}
            onRemove={() => removeGroup(g.key)}
            removable={groups.length > 1}
          />
        ))}

        <p className="text-[10px] text-muted-foreground/70 -mt-1">
          Crops and organisations both come from a read-only vocabulary and can't be added here
          (2026-10-05 backend change — every vocabulary write route is gone). States now cover
          every Indian state and union territory, so there's no "add state" option either. Folder
          options above are every crop/organisation this document's Advisory Type allows — not
          narrowed by state.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">District</span>
            {primaryStateId ? (
              <select
                className={selectClass}
                value={districtId}
                onChange={(e) => {
                  setDistrictId(e.target.value);
                  setKvkId("");
                }}
              >
                <option value="">— none —</option>
                {districtOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-muted-foreground italic py-1.5">
                Pick a state above first
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">KVK</span>
            {districtId ? (
              <select className={selectClass} value={kvkId} onChange={(e) => setKvkId(e.target.value)}>
                <option value="">— none —</option>
                {kvkOptions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-muted-foreground italic py-1.5">
                Select a district first
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/70 col-span-full">
            District/KVK belong to the document as a whole, not to any one placement (2026-10-06
            backend change) — scoped here by the first placement's state above.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-border/50 pt-4">
        <label className={labelClass}>File (PDF)</label>
        <input
          ref={fileInputRef}
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
