import { MultiSelect } from "./MultiSelect";
import { DOMAINS } from "@/components/MetaData";

export const DomainMultiSelect = ({
  selected,
  onChange,
  searchable = false,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}) => {
  return (
    <MultiSelect
      items={DOMAINS.map((d) => ({ value: d, label: d }))}
      selected={selected}
      onChange={onChange}
      searchable={searchable}
      getDisplayLabel={(sel) =>
        sel.length === 0
          ? "All Domains"
          : sel.length === 1
            ? sel[0]
            : `${sel.length} domains selected`
      }
    />
  );
};
