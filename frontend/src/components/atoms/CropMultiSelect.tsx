import { MultiSelect } from "./MultiSelect";

export const CropMultiSelect = ({
  dbCrops,
  crops,
  selected,
  onChange,
  searchable = false,
}: {
  dbCrops: { _id?: string; name: string }[];
  crops: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}) => {
  const cropNames: string[] =
    dbCrops.length > 0 ? dbCrops.map((c) => c.name) : crops;

  const items = cropNames.map((name) => ({
    value: name,
    label: <span className="capitalize">{name}</span>,
  }));

  return (
    <MultiSelect
      items={items}
      selected={selected}
      onChange={onChange}
      searchable={searchable}
      getDisplayLabel={(sel) =>
        sel.length === 0
          ? "All Crops"
          : sel.join(", ")
      }
    />
  );
};
