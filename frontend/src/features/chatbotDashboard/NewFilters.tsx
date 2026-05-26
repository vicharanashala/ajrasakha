import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";

type UserSourceType = "application" | "manual";

type ApplicationSource = "annam" | "vicharanashala" | "whatsapp";

export type Filters = {
  sourceType?: UserSourceType;
  application?: ApplicationSource;
};

type NewFiltersProps = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onSourceChange?: (source: "annam" | "vicharanashala" | "whatsapp") => void;
};

export default function NewFilters({
  filters,
  onChange,
  onSourceChange,
}: NewFiltersProps) {
  return (
    <div>
      {/* Application Filter */}
      {filters.sourceType === "application" && (
        <div className="w-[170px]">
          <Select
            value={filters.application}
            onValueChange={(value: ApplicationSource) => {
              onChange({
                ...filters,
                application: value,
              });
              onSourceChange?.(value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Application" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="annam">Annam</SelectItem>

              <SelectItem value="vicharanashala">VicharanShala</SelectItem>

              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
