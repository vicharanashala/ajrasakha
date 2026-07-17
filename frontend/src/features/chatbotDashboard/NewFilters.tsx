import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {MessageCircle} from "lucide-react";
import { useEffect } from "react";

type UserSourceType = "application" | "manual";

export type ApplicationSource = "annam" | "whatsapp";

export type Filters = {
  sourceType?: UserSourceType;
  application?: ApplicationSource;
};
const applications = [
  {
    value: "annam",
    label: "Annam",
    icon: (
      <img src="/logo.png" alt="Annam" className="h-4 w-4 object-contain" />
    ),
  },
  // {
  //   value: "vicharanashala",
  //   label: "Vicharanashala",
  //   icon: <BookOpen className="h-4 w-4 text-orange-500" />,
  // },
  {
    value: "whatsapp",
    label: "WhatsApp",
    icon: <MessageCircle className="h-4 w-4 text-green-500" />,
  },
];

type NewFiltersProps = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onSourceChange?: (source: "annam" |  "whatsapp") => void;
};

export default function NewFilters({
  filters,
  onChange,
  onSourceChange,
}: NewFiltersProps) {

  useEffect(() => {
    if (filters.application) {
      localStorage.setItem("application-filter", filters.application);
    }
  }, [filters.application]);

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
              {applications.map((app) => (
                <SelectItem key={app.value} value={app.value}>
                  <div className="flex items-center gap-2">
                    {app.icon}
                    <span>{app.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
