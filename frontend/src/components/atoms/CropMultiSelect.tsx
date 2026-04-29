import { AlertTriangle } from "lucide-react";
import { MultiSelect } from "./MultiSelect";

export const CropMultiSelect = ({
  dbCrops,
  crops,
  selected,
  onChange,
}: {
  dbCrops: { _id?: string; name: string }[];
  crops: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  const cropNames: string[] =
    dbCrops.length > 0 ? dbCrops.map((c) => c.name) : crops;

  const items = [
    {
      value: "__NOT_SET__",
      label: (
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
          <span className="text-yellow-700 dark:text-yellow-400 font-medium">
            Not Set (Legacy)
          </span>
        </span>
      ),
    },
    ...cropNames.map((name) => ({
      value: name,
      label: <span className="capitalize">{name}</span>,
    })),
  ];

  return (
    <MultiSelect
      items={items}
      selected={selected}
      onChange={onChange}
      getDisplayLabel={(sel) =>
        sel.length === 0
          ? "All Crops"
          : sel.length === 1
            ? sel[0] === "__NOT_SET__"
              ? "Not Set (Legacy)"
              : sel[0]
            : `${sel.length} crops selected`
      }
    />
  );
};
