// Shared field config for unique-document metadata, verified against the live backend
// (dashboard/schemas.py::UniqueDocumentMetadata / routes_uploads.py::create_upload in the
// POP-Translation repo) — the upload form and the full edit form accept exactly the same set
// of fields, both as UniqueDocumentMetadata.

export type FieldType = "text" | "number" | "date";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
};

// Matches UniqueDocumentMetadata exactly — used by both the Add Document form (spec §4.1) and
// the Unique Documents full edit form (spec §3.2).
export const DOCUMENT_METADATA_FIELDS: FieldDef[] = [
  { key: "advisory_type", label: "Advisory Type", type: "text" },
  { key: "advisory_scope", label: "Advisory Scope", type: "text" },
  { key: "season", label: "Season", type: "text" },
  { key: "edition_revision_volume", label: "Edition/Revision/Volume", type: "text" },
  { key: "date_of_release", label: "Date of Release", type: "text" },
  { key: "month_of_release", label: "Month of Release", type: "number" },
  { key: "year_of_release", label: "Year of Release", type: "number" },
  { key: "date_of_collection", label: "Date of Collection", type: "text" },
  { key: "month_of_collection", label: "Month of Collection", type: "number" },
  { key: "year_of_collection", label: "Year of Collection", type: "number" },
  { key: "advisory_name", label: "Advisory Name", type: "text" },
  { key: "advisory_released_org", label: "Advisory Released Organization", type: "text" },
  { key: "advisory_org_address", label: "Address of Advisory Released Organization", type: "text" },
  { key: "live_source_link", label: "Live Source Link", type: "text" },
  { key: "domain", label: "Domain", type: "text" },
  { key: "verification_status", label: "Verification Status", type: "text" },
  { key: "verified_by", label: "Verified By", type: "text" },
  { key: "document_status", label: "Document Status", type: "text" },
];

// Backend-derived, read-only — shown in the expand/details grid but never submitted (not part
// of UniqueDocumentUpdate).
export const DISPLAY_ONLY_FIELDS: FieldDef[] = [
  { key: "shareable_name", label: "Shareable Name", type: "text" },
  { key: "shareable_link", label: "Shareable Link", type: "text" },
  { key: "language", label: "Language", type: "text" },
  { key: "num_pages", label: "No. of Pages", type: "number" },
  { key: "format_original", label: "Form/Format of Advisory (Original)", type: "text" },
];

export const ALL_UNIQUE_DOCUMENT_FIELDS: FieldDef[] = [
  ...DOCUMENT_METADATA_FIELDS,
  ...DISPLAY_ONLY_FIELDS,
];
