export const humanize = (name: string) => {
  const text = name.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// the 13 checks, used for the Flags filter
export const CHECK_NAMES = [
  "banned_chemical",
  "restricted_chemical",
  "uniformity_of_dose",
  "source_fidelity",
  "source_present",
  "page_number_present",
  "answer_structure",
  "sequence",
  "query_properly_answered",
  "contextuality",
  "private_product_name",
  "officer_name",
  "local_name_mismatch",
];
