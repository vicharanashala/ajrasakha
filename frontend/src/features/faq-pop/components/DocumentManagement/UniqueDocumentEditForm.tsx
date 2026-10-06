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
import { formatDate } from "@/utils/formatDate";
import {
  updateDashboardUniqueDocument,
  getDashboardLanguages,
  getDashboardStates,
  getDashboardDistricts,
  getDashboardKvks,
} from "../../api";
import { DOCUMENT_METADATA_FIELDS, EDITABLE_DOCUMENT_ONLY_FIELDS, DISPLAY_ONLY_FIELDS } from "./fields";
import MetadataFieldInput from "./MetadataFieldInput";

const inputClass =
  "w-full bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring transition-shadow";
const labelClass = "text-xs font-medium text-foreground/70";
const readOnlyClass =
  "text-xs text-foreground break-words rounded border border-border/50 bg-muted/20 px-2 py-1.5 min-h-[30px] flex items-center";
const sectionTitleClass =
  "text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-border/40 pb-1";

const EDITABLE_FIELDS = [...DOCUMENT_METADATA_FIELDS, ...EDITABLE_DOCUMENT_ONLY_FIELDS];

// Every column except State/Folder (those stay placement-tab-only) groups under one of these,
// driven by each FieldDef's `group` (fields.ts) — covers both the editable fields above and
// DISPLAY_ONLY_FIELDS's system-computed ones, combined into one modal (2026-10-05) rather than
// splitting edit vs. view. Identity/Location first since they're what you look a document up by;
// Translation & Review/File Info last since they're the least likely to be acted on from here.
const GROUP_ORDER = [
  "Identity",
  "Location",
  "Advisory Classification",
  "Advisory Details",
  "Release & Collection",
  "Language",
  "Status",
  "Translation & Review",
  "File Info",
];

// Full metadata edit form. Opened from inside DocumentDetailModal, which is itself an open
// Dialog — so this must be a `Dialog` too, not an `AlertDialog`. @radix-ui/react-alert-dialog
// creates its own independent dialog scope (see its `createDialogScope` usage), so stacking it
// on top of an already-open `Dialog` gives two modal roots that both try to focus-trap and
// aria-hide "everything else" without knowing about one another — selecting the Language <select>
// shifts focus in a way that sets off a fight between the two FocusScopes and hangs the tab
// (reported: page freezes after picking a language, console full of "Blocked aria-hidden on an
// element because its descendant retained focus"). Nesting a `Dialog` inside a `Dialog` is the
// pattern Radix actually supports. No `onPointerDownOutside` override here — per the user, an
// outside click should close this modal (and the View modal, DocumentDetailModal.tsx) same as
// any other dialog, so this relies on Dialog's own default dismiss-on-outside-click behavior.
//
// Every editable field here is document-level, including District/KVK (moved off the placement
// 2026-10-06) — PATCH /unique-documents/{id} changes the document, so a save here changes every
// one of its placements at once. Warn up front when placement_count > 1 (doc.placement_count is
// already on the fetched document, no extra request needed).
export default function UniqueDocumentEditForm({ doc, open, onOpenChange, onSaved }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of EDITABLE_FIELDS) v[f.key] = doc?.[f.key] ?? "";
    return v;
  });
  // Which fields the user has actually interacted with this time the modal is open — drives what
  // gets sent on save (see handleSave) instead of every field's current value. PATCH treats an
  // omitted field as "leave alone", so sending every field on every save risked clobbering one
  // nobody touched whenever this form's state didn't exactly mirror the server's (district/kvk's
  // prefill-by-name-match is the clearest example, but it's really a risk for any field). Tracking
  // touches makes "never interacted with" and "interacted with, now blank" distinguishable — the
  // second is a real, explicit clear, the first should never be sent at all.
  const [touched, setTouched] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  function setValue(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setTouched((prev) => new Set(prev).add(key));
  }
  // Same as setValue but for more than one key at once (district's onChange also resets kvk_id —
  // both need marking touched, since clearing the stale kvk on a district change is a real,
  // intentional change too, not a no-op).
  function setValuesTouched(patch) {
    setValues((prev) => ({ ...prev, ...patch }));
    setTouched((prev) => {
      const next = new Set(prev);
      for (const k of Object.keys(patch)) next.add(k);
      return next;
    });
  }
  const [languageOptions, setLanguageOptions] = useState([]);
  useEffect(() => {
    getDashboardLanguages()
      .then((d) => setLanguageOptions(d || []))
      .catch(() => {});
  }, []);

  // District/KVK are document-level fields now (moved off the placement 2026-10-06), and the
  // document carries `district_id`/`kvk_id` directly — so `values.district_id`/`values.kvk_id`
  // (set from `doc` in the initial useState above) are already the right ids, no name-matching
  // prefill needed. This form still has no `state` field of its own though, so District's dropdown
  // borrows the anchor placement's state (same placement Translation/download act on, found by
  // matching `duplicate_links[].zoho_file_id` against `representative_file_id` — `representative_
  // row_id` is gone, see UniqueDocumentsTable.tsx's withAnchorPlacement for the same lookup) the
  // same way UniqueDocumentsTable derives State/Folder for display.
  const anchor = doc?.duplicate_links?.find((l) => l.zoho_file_id === doc.representative_file_id);
  const [stateOptions, setStateOptions] = useState([]);
  useEffect(() => {
    getDashboardStates()
      .then((d) => setStateOptions(d || []))
      .catch(() => {});
  }, []);
  const anchorStateId = stateOptions.find((s) => s.name === anchor?.state)?.id || "";

  // District narrows by the anchor's state; KVK narrows by the district actually SELECTED in this
  // form (values.district_id). Each list carries exactly ONE "All" row (2026-10-05 backend change
  // — one shared row per vocabulary, not per-parent) — a real selectable value kept in the list,
  // distinct from the dropdown's own blank "— none —" option (sends "" / clears, see handleSave).
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

  async function handleSave() {
    // Only touched fields are sent — an untouched field is omitted, which PATCH treats as "leave
    // alone" (confirmed by the backend). Every field is otherwise optional (str | None / int |
    // None): a touched-but-blank field becomes null, EXCEPT district_id/kvk_id and language, which
    // have their own rules below.
    const payload = {};
    for (const key of touched) {
      const f = EDITABLE_FIELDS.find((x) => x.key === key);
      if (!f) continue;
      const raw = values[key];
      if (key === "district_id" || key === "kvk_id") {
        // An empty string on the id field itself clears it (backend fixed this 2026-10-05 — an
        // earlier probe found {"district_id": ""} 400ing, which is why this used to route a clear
        // through the plain-name field instead; that workaround is gone now that the id field
        // handles both). {"district_id": null} / omitted both mean "unchanged", same as every
        // other field — only an explicit "" clears, distinct from picking the real "All" row.
        payload[key] = raw || "";
        continue;
      }
      if (key === "language") {
        // Validated server-side against GET /languages (400 on an unknown code, including "") — a
        // touched-but-blank language has nothing valid to send, so it's left out rather than
        // 400ing the whole save over one field nobody meant to clear this way.
        if (raw) payload.language = raw;
        continue;
      }
      payload[key] = raw === "" || raw == null ? null : f.type === "number" ? Number(raw) : raw;
    }
    // month_of_*/year_of_* aren't editable fields anymore (see fields.ts) but are still real,
    // separately-filterable backend fields — derive them from the date whenever the date itself
    // was touched and given a real value, so filtering by month/year keeps working. Only when
    // touched AND non-blank — a touched-then-cleared date already sends month/year as null via the
    // generic branch above, and an untouched date must never add month/year to the payload at all.
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
    if (Object.keys(payload).length === 0) {
      onOpenChange(false);
      return;
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Document — {doc?.document_id}</DialogTitle>
        </DialogHeader>
        {doc?.placement_count > 1 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            This document is filed in {doc.placement_count} places. Every field below belongs to
            the document itself, so saving updates all {doc.placement_count} placements at once.
          </div>
        )}
        <div className="flex flex-col gap-5 py-2">
          {GROUP_ORDER.map((group) => {
            const editableInGroup = EDITABLE_FIELDS.filter(
              (f) => f.group === group && !["district_id", "kvk_id", "language"].includes(f.key),
            );
            const displayInGroup = DISPLAY_ONLY_FIELDS.filter((f) => f.group === group);
            const isLocation = group === "Location";
            const isLanguage = group === "Language";
            const isIdentity = group === "Identity";
            return (
              <div key={group} className="flex flex-col gap-2">
                <div className={sectionTitleClass}>{group}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {isIdentity && (
                    <div className="flex flex-col gap-1">
                      <label className={labelClass}>Document ID</label>
                      <div className={readOnlyClass}>{doc?.document_id}</div>
                    </div>
                  )}
                  {editableInGroup.map((f) => (
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
                  {isLanguage && (
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
                  )}
                  {isLocation && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className={labelClass}>District</label>
                        {anchorStateId ? (
                          <select
                            className={inputClass}
                            value={values.district_id}
                            onChange={(e) =>
                              setValuesTouched({ district_id: e.target.value, kvk_id: "" })
                            }
                          >
                            <option value="">— none —</option>
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
                            <option value="">— none —</option>
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
                    </>
                  )}
                  {displayInGroup.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className={labelClass}>{f.label}</label>
                      <div className={readOnlyClass}>
                        {doc?.[f.key] ? (
                          f.formatDate ? (
                            formatDate(new Date(doc[f.key]))
                          ) : (
                            doc[f.key]
                          )
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
