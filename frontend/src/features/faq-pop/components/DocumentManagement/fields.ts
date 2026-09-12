// Shared field config for document metadata, verified against docs/first_render_frontend.md
// (backend branch `first_render`) — the "Optional, all as plain form fields" list under
// Uploading is the same set PATCH /unique-documents/{id} accepts, so the Add Document form and
// the full edit form share this one list, same as before. Field *shapes* (ids, language) changed
// from the old POP-Translation backend this used to be verified against — see api.ts's header.

export type FieldType = "text" | "number" | "date" | "select";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  // "language": options come from getDashboardLanguages() rather than being static.
  optionsSource?: "language";
};

// Matches the doc's upload-form field list exactly — used by both the Add Document form and the
// document full edit form. date_of_* are ISO (YYYY-MM-DD, matches `_from`/`_to` range-filter
// values and native <input type="date">) — MetadataFieldInput.tsx renders "date" as a calendar
// picker.
//
// month_of_release/year_of_release/month_of_collection/year_of_collection are still real,
// independently-filterable backend fields (docs/first_render_frontend.md, and still their own
// numberRange columns in UniqueDocumentsTable.tsx — plenty of the 8,748 existing documents have
// an approximate month/year with no exact date at all, e.g. crawled from a folder name). They're
// intentionally NOT in this list — asking someone to fill in a date, a month, and a year
// separately when the month/year are entirely implied by the date was redundant. Both edit forms
// derive month_of_*/year_of_* from date_of_* right before submitting (see handleSave/handleSubmit)
// instead, only when a real date was actually entered — never overwriting an existing
// independently-set month/year with nothing just because the date field was left blank.
export const DOCUMENT_METADATA_FIELDS: FieldDef[] = [
  { key: "advisory_type", label: "Advisory Type", type: "text" },
  { key: "advisory_scope", label: "Advisory Scope", type: "text" },
  { key: "season", label: "Season", type: "text" },
  { key: "edition_revision_volume", label: "Edition/Revision/Volume", type: "text" },
  { key: "date_of_release", label: "Date of Release", type: "date" },
  { key: "date_of_collection", label: "Date of Collection", type: "date" },
  { key: "advisory_name", label: "Advisory Name", type: "text" },
  { key: "advisory_released_org", label: "Advisory Released Organization", type: "text" },
  { key: "advisory_org_address", label: "Address of Advisory Released Organization", type: "text" },
  { key: "live_source_link", label: "Live Source Link", type: "text" },
  { key: "domain", label: "Domain", type: "text" },
  { key: "verification_status", label: "Verification Status", type: "text" },
  { key: "verified_by", label: "Verified By", type: "text" },
  { key: "document_status", label: "Document Status", type: "text" },
];

// Editable, but not part of the upload form or DOCUMENT_METADATA_FIELDS — `language` is
// PATCH-able on the document (validated against GET /languages, 400 on an unknown code) and
// setting it stamps language_source: "manual", so it always needs the dropdown, never free text.
export const EDITABLE_DOCUMENT_ONLY_FIELDS: FieldDef[] = [
  { key: "language", label: "Language", type: "select", optionsSource: "language" },
];

// Backend-derived, read-only — shown in the details grid but never submitted.
export const DISPLAY_ONLY_FIELDS: FieldDef[] = [
  { key: "shareable_name", label: "Shareable Name", type: "text" },
  { key: "shareable_link", label: "Shareable Link", type: "text" },
  { key: "language_source", label: "Language Source", type: "text" },
  { key: "num_pages", label: "No. of Pages", type: "number" },
  { key: "format_original", label: "Form/Format of Advisory (Original)", type: "text" },
  { key: "sha256", label: "SHA-256", type: "text" },
  { key: "placement_count", label: "Placement Count", type: "number" },
];

export const ALL_UNIQUE_DOCUMENT_FIELDS: FieldDef[] = [
  ...DOCUMENT_METADATA_FIELDS,
  ...EDITABLE_DOCUMENT_ONLY_FIELDS,
  ...DISPLAY_ONLY_FIELDS,
];
