// @ts-nocheck

// Shared input renderer for a DOCUMENT_METADATA_FIELDS entry (fields.ts) — used by both
// AddDocumentForm.tsx and UniqueDocumentEditForm.tsx so the two forms can't drift into rendering
// the same field differently. "date" gets a real calendar picker instead of a text box. "select"
// renders a dropdown — sourced from the field's own hardcoded `field.options`, or from the
// `options` prop (used for optionsSource: "users" fields, whose list a parent form fetches once
// and passes down here). If neither yields any options yet (e.g. the users API isn't wired up),
// it falls back to a plain text input rather than rendering a useless empty dropdown.
//
// `allowBlank` (default true) controls the leading "—" option — pass false where blank has a real,
// unwanted side effect (e.g. UniqueDocumentEditForm.tsx sends blank as an explicit null/clear on
// PATCH, which isn't what you want for a field like format_original that's basically always
// already set). Still shown when the current value is empty even with allowBlank={false}, so an
// unset field never renders as if some real option were silently selected.
export default function MetadataFieldInput({ field, value, onChange, className, options, allowBlank = true }) {
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

  if (field.type === "select") {
    const opts = options || field.options || [];
    if (opts.length > 0) {
      const showBlank = allowBlank || !value;
      return (
        <select className={className} value={value || ""} onChange={(e) => onChange(e.target.value)}>
          {showBlank && <option value="">—</option>}
          {opts.map((o) => {
            const val = typeof o === "string" ? o : o.value;
            const label = typeof o === "string" ? o : o.label;
            return (
              <option key={val} value={val}>
                {label}
              </option>
            );
          })}
        </select>
      );
    }
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
