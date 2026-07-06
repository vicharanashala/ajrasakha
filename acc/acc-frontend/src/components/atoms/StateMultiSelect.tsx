import { MultiSelect } from "./MultiSelect";

export const StateMultiSelect = ({
  states,
  selected,
  onChange,
  searchable = false,
}: {
  states: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}) => {
  return (
    <MultiSelect
      items={states.map((s) => ({ value: s, label: s }))}
      selected={selected}
      onChange={onChange}
      searchable={searchable}
      getDisplayLabel={(sel) =>
        sel.length === 0
          ? "All States"
          : sel.length === 1
            ? sel[0]
            : `${sel.length} states selected`
      }
    />
  );
};
