// @ts-nocheck

// Shared input renderer for a DOCUMENT_METADATA_FIELDS entry (fields.ts) — used by both
// AddDocumentForm.tsx and UniqueDocumentEditForm.tsx so the two forms can't drift into rendering
// the same field differently. "date" gets a real calendar picker instead of a text box.
export default function MetadataFieldInput({ field, value, onChange, className }) {
  if (field.type === "date") {
    return (
      <input
        type="date"
        className={className}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      className={className}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
