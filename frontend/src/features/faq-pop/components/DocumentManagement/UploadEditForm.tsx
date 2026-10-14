// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  getDashboardStates,
  getDashboardFolders,
  getDashboardLanguages,
  getDashboardDistricts,
  getDashboardKvks,
} from "../../api";
import { DOCUMENT_METADATA_FIELDS, folderDisplayLabel, filterFoldersByAdvisoryScope } from "./fields";
import MetadataFieldInput from "./MetadataFieldInput";
import { PlacementGroupRow } from "./AddDocumentForm";

const inputClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
const labelClass = "text-xs font-medium text-foreground/70";
const selectClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";

let _editGroupSeq = 0;

// Flattens item.placements (one row per state/folder pair, per GET /dashboard/uploads item shape)
// back into AddDocumentForm-style groups (one row per state, each with a list of folder labels).
// Folders start as placeholder plain names (`folderRefs` carries the real id+kind) — relabelled to
// the real, possibly-disambiguated ("(crop)"/"(organisation)") string once folderOptions loads,
// see the seeding effect in the component below. Matching by id+kind (not name) is what lets this
// tell a same-named crop and organisation apart, the same reason folderDisplayLabel exists.
function groupPlacementsByState(placements) {
  const byState = new Map();
  for (const p of placements || []) {
    if (!byState.has(p.state)) {
      byState.set(p.state, { key: `eg-${++_editGroupSeq}`, state: p.state, folders: [], folderRefs: [] });
    }
    const g = byState.get(p.state);
    const kind = p.crop_kind === "organization" ? "organization" : "crop";
    g.folderRefs.push({ id: p.crop_id || p.organization_id, kind });
    g.folders.push(p.crop); // placeholder until folderOptions resolves the real (disambiguated) label
  }
  return [...byState.values()];
}

function emptyGroup() {
  return { key: `eg-${++_editGroupSeq}`, state: "", folders: [], folderRefs: [] };
}

// Full metadata + placements edit form for an Upload Queue row — only rendered when
// item.actions.can_edit. Reuses the exact same field components/pickers AddDocumentForm.tsx uses
// for the upload form itself (MetadataFieldInput + DOCUMENT_METADATA_FIELDS from fields.ts,
// PlacementGroupRow, StateSelector/MultiSelector), so an approver edits the same shape the
// uploader originally filled in.
//
// PATCH /dashboard/uploads/{id} takes any subset of: a metadata key (same names/types as
// DOCUMENT_METADATA_FIELDS, uploaded_by excluded — it's never in this form), language,
// district_id/kvk_id, and placements (REPLACES the whole list — sending it recomputes candidates
// server-side). `null` clears a field; untouched fields are left out entirely rather than sent as
// their current value, so nothing is clobbered by a save that only touched one field.
export default function UploadEditForm({ item, onSave, onCancel, saving }) {
  const metadata = item.metadata || {};
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of DOCUMENT_METADATA_FIELDS) v[f.key] = metadata[f.key] ?? "";
    return v;
  });
  const [touched, setTouched] = useState(() => new Set());

  const [language, setLanguage] = useState(metadata.language || "");
  const [languageTouched, setLanguageTouched] = useState(false);
  const [districtId, setDistrictId] = useState(metadata.district_id || "");
  const [kvkId, setKvkId] = useState(metadata.kvk_id || "");
  const [locationTouched, setLocationTouched] = useState(false);

  const [groups, setGroups] = useState(() => {
    const g = groupPlacementsByState(item.placements);
    return g.length > 0 ? g : [emptyGroup()];
  });
  const [placementsTouched, setPlacementsTouched] = useState(false);

  const [stateOptions, setStateOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [folderOptions, setFolderOptions] = useState([]);
  const seededRef = useRef(false);

  useEffect(() => {
    getDashboardStates().then((d) => setStateOptions(d || [])).catch(() => {});
    getDashboardLanguages().then((d) => setLanguageOptions(d || [])).catch(() => {});
  }, []);

  function refetchFolders() {
    return getDashboardFolders(values.advisory_type)
      .then((d) => {
        const list = d || [];
        setFolderOptions(list);
        if (!seededRef.current) {
          seededRef.current = true;
          setGroups((prev) =>
            prev.map((g) => ({
              ...g,
              folders: (g.folderRefs || [])
                .map((ref) => {
                  const opt = list.find((o) => o.id === ref.id && o.kind === ref.kind);
                  return opt ? folderDisplayLabel(opt, list) : null;
                })
                .filter(Boolean),
            })),
          );
        } else {
          // Advisory Type changed after the initial seed — drop any folder no longer offered,
          // same as AddDocumentForm's refetchFolders.
          setGroups((prev) =>
            prev.map((g) => ({
              ...g,
              folders: g.folders.filter((f) => list.some((o) => folderDisplayLabel(o, list) === f)),
            })),
          );
        }
      })
      .catch(() => {});
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    refetchFolders();
  }, [values.advisory_type]);

  // Organisations narrowed to this document's Advisory Scope (type == scope) — same rule as
  // AddDocumentForm.tsx. Crops pass through untouched.
  const visibleFolderOptions = useMemo(
    () => filterFoldersByAdvisoryScope(folderOptions, values.advisory_scope),
    [folderOptions, values.advisory_scope],
  );
  useEffect(() => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        folders: g.folders.filter((f) =>
          visibleFolderOptions.some((o) => folderDisplayLabel(o, folderOptions) === f),
        ),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFolderOptions]);

  // Central-scope advisory → auto-select the real "Central" state on every group, same as
  // AddDocumentForm.tsx (shares PlacementGroupRow, including its static "Central" display in
  // place of the dropdown). Moving the scope back off Central clears it back out. Guarded by
  // whether a group actually needs changing so this doesn't mark placementsTouched (and so send a
  // placements payload) on every mount/Advisory Type-driven refetch — only on a real flip.
  useEffect(() => {
    const isCentral = values.advisory_scope === "Central";
    const needsChange = groups.some((g) => (isCentral ? g.state !== "Central" : g.state === "Central"));
    if (!needsChange) return;
    setGroups((prev) =>
      prev.map((g) => ({ ...g, state: isCentral ? "Central" : g.state === "Central" ? "" : g.state })),
    );
    setPlacementsTouched(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.advisory_scope]);

  const primaryStateId = stateOptions.find((s) => s.name === groups[0]?.state)?.id || "";
  const [districtOptions, setDistrictOptions] = useState([]);
  useEffect(() => {
    if (!primaryStateId) {
      setDistrictOptions([]);
      return;
    }
    getDashboardDistricts(primaryStateId).then((d) => setDistrictOptions(d || [])).catch(() => {});
  }, [primaryStateId]);

  const [kvkOptions, setKvkOptions] = useState([]);
  useEffect(() => {
    if (!districtId) {
      setKvkOptions([]);
      return;
    }
    getDashboardKvks(districtId).then((d) => setKvkOptions(d || [])).catch(() => {});
  }, [districtId]);

  function setValue(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setTouched((prev) => new Set(prev).add(key));
  }
  function updateGroup(key, patch) {
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
    setPlacementsTouched(true);
  }
  function addGroup() {
    setGroups((prev) => [...prev, emptyGroup()]);
    setPlacementsTouched(true);
  }
  function removeGroup(key) {
    setGroups((prev) => (prev.length > 1 ? prev.filter((g) => g.key !== key) : prev));
    setPlacementsTouched(true);
  }

  function handleSave() {
    const payload = {};
    for (const key of touched) {
      const f = DOCUMENT_METADATA_FIELDS.find((x) => x.key === key);
      if (!f) continue;
      const raw = values[key];
      payload[key] = raw === "" || raw == null ? null : f.type === "number" ? Number(raw) : raw;
    }
    // month_of_*/year_of_* mirror AddDocumentForm/UniqueDocumentEditForm's own derivation — only
    // when the date itself was touched and given a real value.
    if (touched.has("date_of_release") && payload.date_of_release) {
      const [y, m] = payload.date_of_release.split("-");
      payload.month_of_release = Number(m);
      payload.year_of_release = Number(y);
    }
    if (touched.has("date_of_collection") && payload.date_of_collection) {
      const [y, m] = payload.date_of_collection.split("-");
      payload.month_of_collection = Number(m);
      payload.year_of_collection = Number(y);
    }
    if (languageTouched) payload.language = language || null;
    if (locationTouched) {
      payload.district_id = districtId || null;
      payload.kvk_id = kvkId || null;
    }
    if (placementsTouched) {
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
        .filter((p) => p.state_id && (p.crop_ids || p.organization_ids));
      if (placements.length === 0) {
        toast.error("Select at least one state with at least one folder");
        return;
      }
      payload.placements = placements;
    }
    if (Object.keys(payload).length === 0) {
      onCancel();
      return;
    }
    onSave(payload);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-border/60 bg-background/60 p-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DOCUMENT_METADATA_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">{f.label}</span>
            <MetadataFieldInput field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} className={inputClass} />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">Language</span>
        <select
          className={`${selectClass} sm:max-w-xs`}
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            setLanguageTouched(true);
          }}
        >
          <option value="">— none —</option>
          {languageOptions.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={labelClass}>Placements (state → folder)</span>
          <button
            type="button"
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
            folderOptions={visibleFolderOptions}
            allFolderOptions={folderOptions}
            stateOptions={stateOptions}
            scopeIsCentral={values.advisory_scope === "Central"}
            onChange={(patch) => updateGroup(g.key, patch)}
            onRemove={() => removeGroup(g.key)}
            removable={groups.length > 1}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">District</span>
          {primaryStateId ? (
            <select
              className={selectClass}
              value={districtId}
              onChange={(e) => {
                setDistrictId(e.target.value);
                setKvkId("");
                setLocationTouched(true);
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
            <span className="text-[11px] text-muted-foreground italic py-1.5">Pick a state above first</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">KVK</span>
          {districtId ? (
            <select
              className={selectClass}
              value={kvkId}
              onChange={(e) => {
                setKvkId(e.target.value);
                setLocationTouched(true);
              }}
            >
              <option value="">— none —</option>
              {kvkOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] text-muted-foreground italic py-1.5">Select a district first</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="px-2.5 py-1 rounded border border-primary text-primary text-[11px] hover:bg-primary/10 cursor-pointer disabled:opacity-40"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="px-2.5 py-1 rounded border border-border text-[11px] text-muted-foreground hover:bg-accent cursor-pointer"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
