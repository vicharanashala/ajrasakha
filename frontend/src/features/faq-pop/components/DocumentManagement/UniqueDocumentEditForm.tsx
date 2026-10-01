// @ts-nocheck
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/atoms/dialog";
import {
  updateDashboardUniqueDocument,
  getDashboardLanguages,
  getDashboardStates,
  getDashboardDistricts,
  getDashboardKvks,
} from "../../api";
import { DOCUMENT_METADATA_FIELDS, EDITABLE_DOCUMENT_ONLY_FIELDS } from "./fields";
import MetadataFieldInput from "./MetadataFieldInput";

const inputClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
const labelClass = "text-xs font-medium text-foreground/70";

const EDITABLE_FIELDS = [...DOCUMENT_METADATA_FIELDS, ...EDITABLE_DOCUMENT_ONLY_FIELDS];

// Full metadata edit form. Opened from inside DocumentDetailModal, which is itself an open
// Dialog — so this must be a `Dialog` too, not an `AlertDialog`. @radix-ui/react-alert-dialog
// creates its own independent dialog scope (see its `createDialogScope` usage), so stacking it
// on top of an already-open `Dialog` gives two modal roots that both try to focus-trap and
// aria-hide "everything else" without knowing about one another — selecting the Language <select>
// shifts focus in a way that sets off a fight between the two FocusScopes and hangs the tab
// (reported: page freezes after picking a language, console full of "Blocked aria-hidden on an
// element because its descendant retained focus"). Nesting a `Dialog` inside a `Dialog` is the
// pattern Radix actually supports. `onPointerDownOutside` is overridden below to reproduce
// AlertDialog's one behavior we still want — no accidental close (and lost edits) from a stray
// outside click — since `Dialog`, unlike `AlertDialog`, leaves that handler overridable.
//
// Every field here is document-level — PATCH /unique-documents/{id} changes the document, so a
// save here changes every one of its placements at once. Warn up front when placement_count > 1
// (doc.placement_count is already on the fetched document, no extra request needed).
export default function UniqueDocumentEditForm({ doc, open, onOpenChange, onSaved }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of EDITABLE_FIELDS) v[f.key] = doc?.[f.key] ?? "";
    return v;
  });
  const [saving, setSaving] = useState(false);

  const [languageOptions, setLanguageOptions] = useState([]);
  useEffect(() => {
    getDashboardLanguages()
      .then((d) => setLanguageOptions(d || []))
      .catch(() => {});
  }, []);

  // District/KVK are placement-level (like state/crop), so this document-level form has no
  // `state` field of its own to scope them by — it borrows the anchor placement's state (same
  // placement Translation/download act on) the same way UniqueDocumentsTable derives State/Folder
  // for display. `duplicate_links` entries only carry the anchor's district/kvk as plain NAMES, not
  // ids, so pre-selecting the right dropdown option means resolving that name against the fetched
  // id-based options once they load (see the prefill effects below) — mirrors how MainTable's own
  // inline edit resolves a folder name back to an id before saving.
  const anchor = doc?.duplicate_links?.find((l) => l.row_id === doc.representative_row_id);
  const [stateOptions, setStateOptions] = useState([]);
  useEffect(() => {
    getDashboardStates()
      .then((d) => setStateOptions(d || []))
      .catch(() => {});
  }, []);
  const anchorStateId = stateOptions.find((s) => s.name === anchor?.state)?.id || "";

  // District narrows by the anchor's state; KVK narrows by the district actually SELECTED in this
  // form (values.district_id) — a KVK belongs to one district, not directly to a state — so once
  // the district prefill (below) resolves, this effect re-fires and fetches the right KVK list on
  // its own.
  const [districtOptions, setDistrictOptions] = useState([]);
  useEffect(() => {
    if (!anchorStateId) {
      setDistrictOptions([]);
      return;
    }
    getDashboardDistricts(anchorStateId)
      .then((d) => setDistrictOptions(d || []))
      .catch(() => {});
  }, [anchorStateId]);

  const [kvkOptions, setKvkOptions] = useState([]);
  useEffect(() => {
    if (!values.district_id) {
      setKvkOptions([]);
      return;
    }
    getDashboardKvks(values.district_id)
      .then((d) => setKvkOptions(d || []))
      .catch(() => {});
  }, [values.district_id]);

  // One-shot prefill once each option list lands — doesn't re-run after that, so it never
  // clobbers a value the user has since picked (or cleared) by hand.
  const [districtPrefilled, setDistrictPrefilled] = useState(false);
  useEffect(() => {
    if (districtPrefilled || !anchor?.district || districtOptions.length === 0) return;
    const match = districtOptions.find((d) => d.name === anchor.district);
    if (match) setValue("district_id", match.id);
    setDistrictPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtOptions, districtPrefilled]);
  const [kvkPrefilled, setKvkPrefilled] = useState(false);
  useEffect(() => {
    if (kvkPrefilled || !anchor?.kvk || kvkOptions.length === 0) return;
    const match = kvkOptions.find((k) => k.name === anchor.kvk);
    if (match) setValue("kvk_id", match.id);
    setKvkPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kvkOptions, kvkPrefilled]);

  function setValue(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    // Every field is optional (str | None / int | None) — an empty string must become null
    // rather than being sent as "" (a number field would 422 on an empty string). `language`,
    // `district_id` and `kvk_id` are never sent as null — leave them out of the payload entirely
    // if unchanged/empty rather than clearing them. For district/kvk specifically this isn't
    // optional caution: the dropdown only pre-selects the anchor placement's CURRENT value when
    // its name happens to match an option from the fetched list exactly (see the prefill effects
    // above) — a near-miss (casing, whitespace, a name not yet in the canonical list) leaves the
    // select blank even though a real value exists, and treating blank as "clear" there would
    // silently wipe it on save.
    const payload = {};
    for (const f of EDITABLE_FIELDS) {
      const raw = values[f.key];
      if (f.key === "language" || f.key === "district_id" || f.key === "kvk_id") {
        if (raw) payload[f.key] = raw;
        continue;
      }
      if (raw === "" || raw == null) {
        payload[f.key] = null;
      } else {
        payload[f.key] = f.type === "number" ? Number(raw) : raw;
      }
    }
    // month_of_*/year_of_* aren't editable fields anymore (see fields.ts) but are still real,
    // separately-filterable backend fields — derive them from the date whenever a real date was
    // entered, so filtering by month/year keeps working for documents edited here. Only when the
    // date is a real value, never when it's empty/cleared — that would send month/year as null
    // too and clobber an existing value nobody has an exact date for.
    if (payload.date_of_release) {
      const [y, m] = payload.date_of_release.split("-");
      payload.month_of_release = Number(m);
      payload.year_of_release = Number(y);
    }
    if (payload.date_of_collection) {
      const [y, m] = payload.date_of_collection.split("-");
      payload.month_of_collection = Number(m);
      payload.year_of_collection = Number(y);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
        </DialogHeader>
        {doc?.placement_count > 1 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            This document is filed in {doc.placement_count} places. Every field below changes the
            document itself, so saving updates all {doc.placement_count} placements at once.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className={labelClass}>Document Name</label>
            <input
              type="text"
              className={inputClass}
              value={values.shareable_name}
              onChange={(e) => setValue("shareable_name", e.target.value)}
              placeholder="Shareable name shown across the dashboard"
            />
          </div>
          {DOCUMENT_METADATA_FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1">
              <label className={labelClass}>{f.label}</label>
              <MetadataFieldInput
                field={f}
                value={values[f.key]}
                onChange={(v) => setValue(f.key, v)}
                className={inputClass}
                allowBlank={f.key !== "format_original"}
              />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Language</label>
            <select
              className={inputClass}
              value={values.language}
              onChange={(e) => setValue("language", e.target.value)}
            >
              <option value="">— unchanged —</option>
              {languageOptions.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>District</label>
            {anchorStateId ? (
              <select
                className={inputClass}
                value={values.district_id}
                onChange={(e) => {
                  setValue("district_id", e.target.value);
                  setValue("kvk_id", "");
                }}
              >
                <option value="">— unchanged —</option>
                {districtOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-muted-foreground italic py-1.5">
                Select a state first
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>KVK</label>
            {values.district_id ? (
              <select
                className={inputClass}
                value={values.kvk_id}
                onChange={(e) => setValue("kvk_id", e.target.value)}
              >
                <option value="">— unchanged —</option>
                {kvkOptions.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-muted-foreground italic py-1.5">
                Select a district first
              </span>
            )}
          </div>
        </div>
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
