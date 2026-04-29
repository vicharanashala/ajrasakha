import { AlertTriangle } from "lucide-react";
import { MultiSelect } from "./MultiSelect";
import type { ICropAlias } from "@/hooks/services/cropService";

export const CropMultiSelect = ({
  dbCrops,
  crops,
  selected,
  onChange,
}: {
  dbCrops: { _id?: string; name: string; aliases?: ICropAlias[] }[];
  crops: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) => {
  const cropList: { name: string; aliases?: ICropAlias[] }[] =
    dbCrops.length > 0 ? dbCrops : crops.map((c) => ({ name: c }));

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
    ...cropList.map((crop) => ({
      value: crop.name,
      label: (
        <span className="flex items-center gap-2">
          <span className="capitalize">{crop.name}</span>
          {crop.aliases && crop.aliases.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
              +{crop.aliases.length}
            </span>
          )}
        </span>
      ),
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
