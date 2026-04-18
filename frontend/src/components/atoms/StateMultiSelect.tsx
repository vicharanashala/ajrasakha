import { MultiSelect } from "./MultiSelect";

export const StateMultiSelect = ({
  states,
  selected,
  onChange,
}: {
  states: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  return (
    <MultiSelect
      items={states.map((s) => ({ value: s, label: s }))}
      selected={selected}
      onChange={onChange}
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
