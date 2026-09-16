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
  // "language": options come from getDashboardLanguages(). "users": options come from
  // getDashboardUsers() — fetched once by the consuming form and passed to MetadataFieldInput as
  // its `options` prop (overriding `options` below). Static "select" fields just carry `options`
  // directly, no fetch needed.
  optionsSource?: "language" | "users";
  options?: string[] | { value: string; label: string }[];
};

// Hardcoded dropdown vocabularies (requested 2026-09-11) — these are UI-only constraints, not a
// backend-validated enum (docs/first_render_frontend.md documents no whitelist for any of these
// fields), so the value sent over the wire is still just the plain string the user picked, exactly
// like the free-text inputs these replaced. Keep this list as the single source of truth for these
// options — both the add/edit forms and the column filters (MainTable.tsx/UniqueDocumentsTable.tsx)
// import from here so the two can't drift.
// Exact spelling confirmed against the backend (2026-09-15) — it also drives the Folder dropdown's
// crop-vs-organization rule (MainTable.tsx/AddDocumentForm.tsx), matched there on letters only, so
// this spelling matters for the label shown to people, not for correctness of that rule.
export const ADVISORY_TYPE_OPTIONS = ["Comprehensive", "Crop Advisory", "Non-Crop Advisory", "General"];

export const ADVISORY_SCOPE_OPTIONS = ["Central", "State", "District", "Town", "Village"];

export const SEASON_OPTIONS = [
  "Kharif",
  "Rabi",
  "Zaid",
  "Annual",
  "Perennial",
  "Multiple Seasons",
  "Not Applicable",
];

export const DOMAIN_OPTIONS = [
  "Soil Health and Nutrient Management",
  "Irrigation and Water Management",
  "Insect and Pest Management",
  "Disease Management",
  "Seed and Variety Selection",
  "Cultural and Crop Management Practices",
  "Organic and Natural Farming",
  "Weed Management",
  "Climate, Weather and Stress Management",
  "Farm Tools and Mechanisation",
  "Post-Harvest Management and Storage",
  "Market Prices, MSP and Marketing",
  "Agricultural Schemes and Subsidies",
  "Credit, Loan and Insurance",
  "Capacity Building, Extension and Communication",
  "Rural Infrastructure",
  "Animal Husbandry and Livestock",
  "Fisheries and Aquaculture",
  "Allied Agricultural Activities",
];

// format_original IS user-settable (confirmed by backend, despite docs/first_render_frontend.md
// being silent on it — PATCH has always taken it, and POST /dashboard/uploads now takes an
// optional `format_original` form field: blank/absent = derive from the file extension, set = it
// wins e.g. a PDF that's a scan of a printed document). The column filter does an exact,
// case-sensitive match against the stored value, and every stored value is lower-case
// (`pdf`/`png`/`docx`/…, plus `url` for "Web Page" and `printed` for "Printed Document") — so
// `value` here is always the lower-case wire form, `label` the human-readable one. Never send the
// label.
export const FORMAT_ORIGINAL_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "doc", label: "DOC" },
  { value: "docx", label: "DOCX" },
  { value: "xls", label: "XLS" },
  { value: "xlsx", label: "XLSX" },
  { value: "ppt", label: "PPT" },
  { value: "pptx", label: "PPTX" },
  { value: "html", label: "HTML" },
  { value: "txt", label: "TXT" },
  { value: "jpg", label: "JPG" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "tiff", label: "TIFF" },
  { value: "zip", label: "ZIP" },
  { value: "printed", label: "Printed Document" },
  { value: "url", label: "Web Page" },
];

export const VERIFICATION_STATUS_OPTIONS = ["Verified", "Pending Verification", "Rejected"];

export const DOCUMENT_STATUS_OPTIONS = [
  "Under Review",
  "Active",
  "Outdated",
  "Archived",
  "Superseded",
  "Withdrawn",
];

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
  { key: "advisory_type", label: "Advisory Type", type: "select", options: ADVISORY_TYPE_OPTIONS },
  { key: "advisory_scope", label: "Advisory Scope", type: "select", options: ADVISORY_SCOPE_OPTIONS },
  { key: "season", label: "Season", type: "select", options: SEASON_OPTIONS },
  { key: "edition_revision_volume", label: "Edition/Revision/Volume", type: "text" },
  { key: "date_of_release", label: "Date of Release", type: "date" },
  { key: "date_of_collection", label: "Date of Collection", type: "date" },
  { key: "advisory_name", label: "Advisory Name", type: "text" },
  { key: "advisory_released_org", label: "Advisory Released Organization", type: "text" },
  { key: "advisory_org_address", label: "Address of Advisory Released Organization", type: "text" },
  { key: "live_source_link", label: "Live Source Link", type: "text" },
  { key: "domain", label: "Domain", type: "select", options: DOMAIN_OPTIONS },
  // On upload, blank = auto-detect from the file extension (uploadDashboardDocument only appends
  // non-empty fields to the form, so a blank pick sends nothing). On PATCH (the edit form), blank
  // sends null and CLEARS the field — UniqueDocumentEditForm.tsx hides the blank option here for
  // that reason, since format is essentially always already set and clearing it isn't a real use
  // case.
  { key: "format_original", label: "Form/Format of Advisory (Original)", type: "select", options: FORMAT_ORIGINAL_OPTIONS },
  { key: "verification_status", label: "Verification Status", type: "select", options: VERIFICATION_STATUS_OPTIONS },
  // options come from getDashboardUsers() (see api.ts) via optionsSource — falls back to a plain
  // text input in MetadataFieldInput.tsx until that API is confirmed/available (asked backend).
  { key: "verified_by", label: "Verified By", type: "select", optionsSource: "users" },
  { key: "document_status", label: "Document Status", type: "select", options: DOCUMENT_STATUS_OPTIONS },
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
  { key: "sha256", label: "SHA-256", type: "text" },
  { key: "placement_count", label: "Placement Count", type: "number" },
];

export const ALL_UNIQUE_DOCUMENT_FIELDS: FieldDef[] = [
  ...DOCUMENT_METADATA_FIELDS,
  ...EDITABLE_DOCUMENT_ONLY_FIELDS,
  ...DISPLAY_ONLY_FIELDS,
];
