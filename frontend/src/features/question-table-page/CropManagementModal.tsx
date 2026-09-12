import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import { Plus, Cpu, Wheat, Pencil, X, Loader2, Check, Languages, Trash2, Search, FlaskConical, LayoutGrid, Upload, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { toast } from "sonner";
import { useCreateCrop } from "@/hooks/api/crop/useCreateCrop";
import { useUpdateCrop } from "@/hooks/api/crop/useUpdateCrop";
import { CropAuditTrailModal } from "./CropAuditTrailModal";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { SampleCsvButton } from "./SampleCsvButton";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { useBulkUploadCrops } from "@/hooks/api/crop/useBulkUploadCrops";
import { useGetCropEntryTypes } from "@/hooks/api/crop/useGetCropEntryTypes";
import { CropService } from "@/hooks/services/cropService";
import type { ICropAlias, ICropResponse, IBulkJobResult, CropUploadType } from "@/hooks/services/cropService";
import { BulkResultsModal, downloadBulkResultsCsv } from "./BulkResultsModal";
import { OrganizationBulkUploadModal } from "./OrganizationBulkUploadModal";

const cropServiceForStatus = new CropService();
import { useGetStates, useGetDistricts } from "@/hooks/api/location/useLocations";
import { useGetOrganizations } from "@/hooks/api/organization/useGetOrganizations";
import { useCreateOrganization } from "@/hooks/api/organization/useCreateOrganization";
import { useUpdateOrganization } from "@/hooks/api/organization/useUpdateOrganization";
import { useDeleteOrganization } from "@/hooks/api/organization/useDeleteOrganization";
import { Building2 } from "lucide-react";
import { CropMultiSelect } from "@/components/atoms/CropMultiSelect";

/** Static fallback for the crop-side categories under the "Other" tab, used until the
 *  backend list (/crops/entry-types) loads. The live list drives the UI, so adding a
 *  new category is a one-line backend change with no edit here. */
const OTHER_TYPE_OPTIONS = ["weed", "pest", "disease"] as const;

/** Display label for a category — Title-cased, works for any future type. */
const labelOf = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");

/** Reserved type names — each has its own dedicated/catch-all tab, so a custom
 *  "Other" type may not reuse one (it would collide with those tabs). */
const RESERVED_TYPES = ["crop", "chemical", "other"];

type ICropAliasObject = ICropAlias;

const INDIAN_LANGUAGES = [
  { code: "as-IN",  en: "Assamese",          native: "অসমীয়া" },
  { code: "bn-IN",  en: "Bengali",           native: "বাংলা" },
  { code: "bho-IN", en: "Bhojpuri",          native: "भोजपुरी" },
  { code: "brx-IN", en: "Bodo",              native: "बड़ो" },
  { code: "doi-IN", en: "Dogri",             native: "डोगरी" },
  { code: "gu-IN",  en: "Gujarati",          native: "ગુજરાતી" },
  { code: "hi-IN",  en: "Hindi",             native: "हिन्दी" },
  { code: "kn-IN",  en: "Kannada",           native: "ಕನ್ನಡ" },
  { code: "ks-IN",  en: "Kashmiri",          native: "کشمیری" },
  { code: "kok-IN", en: "Konkani",           native: "कोंकणी" },
  { code: "mai-IN", en: "Maithili",          native: "मैथिली" },
  { code: "ml-IN",  en: "Malayalam",         native: "മലയാളം" },
  { code: "mni-IN", en: "Manipuri (Meitei)", native: "ꯃꯤꯇꯩ ꯂꯣꯟ" },
  { code: "mr-IN",  en: "Marathi",           native: "मराठी" },
  { code: "ne-IN",  en: "Nepali",            native: "नेपाली" },
  { code: "or-IN",  en: "Odia",              native: "ଓଡ଼ିଆ" },
  { code: "pa-IN",  en: "Punjabi",           native: "ਪੰਜਾਬੀ" },
  { code: "raj-IN", en: "Rajasthani",        native: "राजस्थानी" },
  { code: "sa-IN",  en: "Sanskrit",          native: "संस्कृतम्" },
  { code: "sat-IN", en: "Santali",           native: "ᱥᱟᱱᱛᱟᱲᱤ" },
  { code: "sd-IN",  en: "Sindhi",            native: "سنڌي" },
  { code: "ta-IN",  en: "Tamil",             native: "தமிழ்" },
  { code: "te-IN",  en: "Telugu",            native: "తెలుగు" },
  { code: "ur-IN",  en: "Urdu",              native: "اردو" },
];


const emptyAliasEntry = (): ICropAliasObject => ({
  language: "",
  region: "",
  english_representation: "",
  native_representation: "",
});

type CropManagementModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// ── AliasEntryForm ────────────────────────────────────────────────────────────
// Compact form for adding a single new alias entry.
const AliasEntryForm = ({
  onAdd,
  accentColor = "amber",
  isChemical = false,
  isOther = false,
  editEntry = null,
  onUpdate,
  onCancelEdit,
}: {
  onAdd: (alias: ICropAliasObject) => void;
  accentColor?: "amber" | "blue";
  isChemical?: boolean;
  isOther?: boolean;
  /** When set, the form is in EDIT mode — prefilled with this alias. */
  editEntry?: ICropAliasObject | null;
  onUpdate?: (alias: ICropAliasObject) => void;
  onCancelEdit?: () => void;
}) => {
  const [entry, setEntry] = useState<ICropAliasObject>(emptyAliasEntry());
  const [regionInput, setRegionInput] = useState("");
  const isAmber = accentColor === "amber";
  const isEditing = !!editEntry;

  // Prefill when entering edit mode; reset when it clears.
  useEffect(() => {
    setEntry(editEntry ? { ...editEntry } : emptyAliasEntry());
    setRegionInput("");
  }, [editEntry]);

  const addBtnClass = isAmber
    ? "bg-amber-600 hover:bg-amber-700 text-white"
    : "bg-blue-600 hover:bg-blue-700 text-white";

  const canAdd = isChemical
    ? entry.english_representation.trim() !== ""
    : entry.language.trim() !== "" &&
      entry.english_representation.trim() !== "" &&
      entry.native_representation.trim() !== "";

  const handleAdd = () => {
    if (!canAdd) return;
    // Commit any region the user typed but didn't press Enter on, so it isn't lost.
    const pendingRegion = regionInput.trim();
    const currentRegions = entry.region
      ? entry.region.split(",").map((r) => r.trim()).filter(Boolean)
      : [];
    if (pendingRegion && !currentRegions.includes(pendingRegion)) {
      currentRegions.push(pendingRegion);
    }
    const finalEntry: ICropAliasObject = {
      ...entry,
      region: currentRegions.join(", "),
    };
    if (isEditing) {
      onUpdate?.(finalEntry);
    } else {
      onAdd(finalEntry);
    }
    setEntry(emptyAliasEntry());
    setRegionInput("");
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-[#141414] p-4 space-y-3">
      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {isEditing
          ? isChemical
            ? "Edit Trade Name"
            : "Edit Alias"
          : isChemical
            ? "Add New Trade Name"
            : "Add New Alias"}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            Language
          </span>
          <Select
            value={entry.language}
            onValueChange={(val) => setEntry((e) => ({ ...e, language: val }))}
          >
            <SelectTrigger
              size="sm"
              className="h-8 text-xs w-full bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
            >
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {INDIAN_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.en} className="text-xs">
                  {lang.en}
                  <span className="text-gray-400 dark:text-gray-500 ml-1.5">— {lang.native}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            Region
          </span>
          <div className="flex flex-col gap-1.5">
            <Input
              placeholder="Type region & press Enter"
              value={regionInput}
              onChange={(e) => setRegionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = regionInput.trim();
                  if (val) {
                    const currentRegions = entry.region ? entry.region.split(',').map(r => r.trim()).filter(Boolean) : [];
                    if (!currentRegions.includes(val)) {
                      setEntry(f => ({ ...f, region: [...currentRegions, val].join(', ') }));
                    }
                    setRegionInput("");
                  }
                }
              }}
              className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
            />
            {entry.region && (
              <div className="flex flex-wrap gap-1 mt-1">
                {entry.region.split(',').map(r => r.trim()).filter(Boolean).map(region => (
                  <span
                    key={region}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-[10px] font-medium border bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                  >
                    {region}
                    <button
                      type="button"
                      onClick={() => {
                        const newRegions = entry.region.split(',').map(r=>r.trim()).filter(r => r && r !== region);
                        setEntry(f => ({ ...f, region: newRegions.join(', ') }));
                      }}
                      className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-rose-500"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            English Name
          </span>
          <Input
            placeholder={isChemical ? "e.g. Alachlor" : isOther ? "e.g. Seed Drill" : "e.g. Dhaan"}
            value={entry.english_representation}
            onChange={(e) => setEntry((f) => ({ ...f, english_representation: e.target.value }))}
            className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
          />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            {isChemical ? "Native Script" : "Native Name"}
          </span>
          <Input
            placeholder={isChemical ? "e.g. ग्लाइफोसेट" : isOther ? "e.g. सीड ड्रिल" : "e.g. धान"}
            value={entry.native_representation}
            onChange={(e) => setEntry((f) => ({ ...f, native_representation: e.target.value }))}
            className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {isEditing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onCancelEdit?.()}
            className="h-7 text-[11px] gap-1 px-3 rounded-md"
          >
            <X className="h-3 w-3" />
            Cancel
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={!canAdd}
          className={`h-7 text-[11px] gap-1 px-3 rounded-md disabled:opacity-40 ${addBtnClass}`}
        >
          {isEditing ? (
            <>
              <Check className="h-3 w-3" />
              {isChemical ? "Update Trade Name" : "Update Alias"}
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              {isChemical ? "Add Trade Name" : "Add Alias"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
// CREATE COMMON COMPONENT

/**
 * Renders a "/"-separated list of crop names: the first name in FULL (not trimmed),
 * then a "+N" badge for the rest. Hovering shows every name in a tooltip.
 */
const CropNamesCell = ({
  value,
  className,
}: {
  value: string;
  className?: string;
}) => {
  const names = (value || "")
    .split("/")
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) {
    return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>;
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex w-max max-w-full items-center gap-1.5 cursor-default">
            <span className={className}>{names[0]}</span>
            {names.length > 1 && (
              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-white/5 px-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300">
                +{names.length - 1}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-[300px] p-2 z-[100]">
          <div className="flex flex-col gap-1.5">
            {names.map((n, idx) => (
              <span key={idx} className="text-xs break-words">
                • {n}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/** Format an ISO timestamp for the management tables; "-" when missing/invalid. */
const fmtAuditDate = (v?: string): string => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const StructuredAliasesTable = ({
  aliases,
  onRemove,
  onEdit,
  editingIndex,
}: {
  aliases: ICropAliasObject[];
  onRemove: (index: number) => void;
  onEdit?: (index: number) => void;
  /** Row currently being edited (highlighted). */
  editingIndex?: number | null;
}) => {
  if (aliases.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_64px] gap-0 bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
        {["Language", "Region", "English", "Native", ""].map((h, i) => (
          <div
            key={i}
            className="px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
          >
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {aliases.map((alias, i) => (
        <div
          key={i}
          className={`grid grid-cols-[1fr_1fr_1fr_1fr_64px] gap-0 items-center group transition-colors
            ${
              i < aliases.length - 1
                ? "border-b border-gray-100 dark:border-gray-800/60"
                : ""
            }
            ${
              editingIndex === i
                ? "bg-amber-50/70 dark:bg-amber-500/5"
                : "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
            }`}
        >
          <div className="px-3 py-2.5 min-w-0">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/15">
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                {alias.language}
              </span>
            </span>
          </div>

          <div className="px-3 py-2.5 min-w-0">
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate block">
              {alias.region || (
                <span className="text-gray-300 dark:text-gray-600">—</span>
              )}
            </span>
          </div>

          <div className="px-3 py-2.5 min-w-0">
            <CropNamesCell
              value={alias.english_representation}
              className="text-xs font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap"
            />
          </div>

          <div className="px-3 py-2.5 min-w-0">
            <CropNamesCell
              value={alias.native_representation}
              className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap"
            />
          </div>

          <div className="flex items-center justify-center gap-0.5 pr-1">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(i)}
                title="Edit alias"
                className={`p-1 rounded-md transition-all text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 ${
                  editingIndex === i ? "opacity-100 text-amber-600 dark:text-amber-400" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              title="Delete alias"
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── AliasManagerModal ─────────────────────────────────────────────────────────
// Dedicated modal for viewing, adding, and deleting aliases for a single crop.
const AliasManagerModal = ({
  crop,
  allCropOptions,
  onClose,
}: {
  crop: ICropResponse;
  allCropOptions: ICropResponse[];
  onClose: () => void;
}) => {
  const all = crop.aliases || [];
  const isChemicalEntry = crop.type === "chemical";
  const [legacyAliases, setLegacyAliases] = useState<string[]>(
    all.filter((a): a is string => typeof a === "string")
  );
  const [structuredAliases, setStructuredAliases] = useState<ICropAliasObject[]>(
    all.filter((a): a is ICropAliasObject => typeof a !== "string")
  );
  const [chemicalStatus, setChemicalStatus] = useState(crop.status ?? "");
  const [chemicalCrops, setChemicalCrops] = useState<string[]>(crop.crops ?? []);
  const [scientificName, setScientificName] = useState(crop.scientificName ?? "");

  const { mutateAsync: updateCrop, isPending: isUpdating } = useUpdateCrop();

  const totalCount = legacyAliases.length + structuredAliases.length;

  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAdd = (alias: ICropAliasObject) => {
    setStructuredAliases((prev) => [...prev, alias]);
  };

  const handleUpdateStructured = (alias: ICropAliasObject) => {
    setStructuredAliases((prev) =>
      prev.map((a, i) => (i === editingIndex ? alias : a)),
    );
    setEditingIndex(null);
  };

  const handleRemoveStructured = (index: number) => {
    // Keep the edit form in sync if the edited/earlier row is removed.
    setEditingIndex((cur) =>
      cur === null ? null : cur === index ? null : cur > index ? cur - 1 : cur,
    );
    setStructuredAliases((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveLegacy = (alias: string) => {
    setLegacyAliases((prev) => prev.filter((a) => a !== alias));
  };

  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);

  const handleSave = async () => {
    if (!crop._id) return;
    try {
      const payload: { aliases: (ICropAliasObject | string)[]; status?: string; crops?: string[]; scientificName?: string } = {
        aliases: [...legacyAliases, ...structuredAliases],
      };
      if (isChemicalEntry) {
        payload.status = chemicalStatus;
        payload.crops = chemicalCrops;
      } else {
        // Send the trimmed value; an empty string clears the scientific name.
        payload.scientificName = scientificName.trim();
      }
      const res = await updateCrop({ cropId: crop._id, payload });
      if (res?.success) {
        toast.success(`"${crop.name}" updated successfully!`);
        onClose();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="w-[80vw] sm:max-w-[80vw] max-w-[95vw] h-[82vh] p-0 flex flex-col overflow-hidden gap-0"
        showCloseButton={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {(() => {
              const t = crop.type ?? "crop";
              const isC = t === "chemical";
              const isO = t === "other";
              const ModalIcon = isC ? FlaskConical : isO ? LayoutGrid : Wheat;
              return (
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isC ? "bg-purple-100/80 dark:bg-purple-500/10" : isO ? "bg-blue-100/80 dark:bg-blue-500/10" : "bg-amber-100/80 dark:bg-amber-500/10"}`}>
                  <ModalIcon className={`h-4 w-4 ${isC ? "text-purple-600 dark:text-purple-400" : isO ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`} />
                </div>
              );
            })()}
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                {crop.name}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {totalCount === 0
                  ? "No aliases yet"
                  : `${totalCount} alias${totalCount !== 1 ? "es" : ""}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="group h-8 w-8 flex items-center justify-center rounded-full bg-gray-50 dark:bg-[#1a1a1a] hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-gray-200 dark:border-gray-800 hover:border-rose-200 dark:hover:border-rose-800/30 text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 shadow-sm transition-all duration-300 focus:outline-none"
            title="Close"
          >
            <X className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-active:scale-95" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Scientific name — biological entries only (not chemicals) ── */}
          {!isChemicalEntry && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Scientific Name
                <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                  — optional
                </span>
              </p>
              <Input
                placeholder="e.g. Oryza sativa"
                value={scientificName}
                onChange={(e) => setScientificName(e.target.value)}
                className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 italic"
              />
            </div>
          )}

          {/* ── Chemical Status ───────────────────────────────────────── */}
          {isChemicalEntry && (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Status
                </p>
                <Input
                  placeholder={crop.status || "e.g. Restricted, Banned, Under Review…"}
                  value={chemicalStatus}
                  onChange={(e) => setChemicalStatus(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                />
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Associated Crops
                </p>
                <CropMultiSelect
                  dbCrops={allCropOptions}
                  crops={chemicalCrops}
                  selected={chemicalCrops}
                  onChange={setChemicalCrops}
                />
                {chemicalCrops.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {chemicalCrops.map((cropName) => (
                      <span
                        key={cropName}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs font-medium border bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                      >
                        <span>{cropName}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setChemicalCrops((prev) =>
                              prev.filter((name) => name !== cropName),
                            )
                          }
                          className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-rose-500"
                          aria-label={`Remove ${cropName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Structured Aliases Table ──────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5">
              Structured Aliases
            </p>
            {structuredAliases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-gray-200 dark:border-gray-700/60 bg-gray-50/50 dark:bg-white/[0.02]">
                <Languages className="h-6 w-6 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No structured aliases added yet
                </p>
              </div>
            ) : (
              <StructuredAliasesTable
              aliases={structuredAliases}
              onRemove={handleRemoveStructured}
              onEdit={setEditingIndex}
              editingIndex={editingIndex}
            />
            )}
          </div>

          {/* ── Legacy Aliases ────────────────────────────────────────── */}
          {legacyAliases.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                Legacy Aliases
                <span className="font-normal normal-case tracking-normal text-gray-400 dark:text-gray-600">
                  — plain text format
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {legacyAliases.map((alias) => (
                  <span
                    key={alias}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg text-xs font-medium border bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                  >
                    {alias}
                    <button
                      type="button"
                      onClick={() => handleRemoveLegacy(alias)}
                      className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Add / Edit Alias Form ─────────────────────────────────── */}
          <AliasEntryForm
            onAdd={handleAdd}
            accentColor="amber"
            isChemical={isChemicalEntry}
            editEntry={editingIndex !== null ? structuredAliases[editingIndex] : null}
            onUpdate={handleUpdateStructured}
            onCancelEdit={() => setEditingIndex(null)}
          />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50/50 dark:bg-white/[0.01]">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {structuredAliases.length + legacyAliases.length} total alias
            {structuredAliases.length + legacyAliases.length !== 1 ? "es" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 text-xs rounded-lg"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmUpdateOpen(true)}
              disabled={isUpdating}
              className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Save Changes
                </>
              )}
            </Button>
          </div>

          <ConfirmationModal
            open={confirmUpdateOpen}
            onOpenChange={setConfirmUpdateOpen}
            title={`Update "${crop.name}"?`}
            description="Save your changes to this entry's aliases and details."
            confirmText="Update"
            isLoading={isUpdating}
            onConfirm={handleSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── AliasSection (used in Add Crop form) ─────────────────────────────────────
const AliasSection = ({
  aliases,
  onAliasesChange,
  isChemical = false,
  isOther = false,
}: {
  aliases: ICropAliasObject[];
  onAliasesChange: (next: ICropAliasObject[]) => void;
  isChemical?: boolean;
  isOther?: boolean;
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAdd = (alias: ICropAliasObject) => {
    onAliasesChange([...aliases, alias]);
  };

  const handleUpdate = (alias: ICropAliasObject) => {
    onAliasesChange(aliases.map((a, idx) => (idx === editingIndex ? alias : a)));
    setEditingIndex(null);
  };

  const handleRemove = (i: number) => {
    setEditingIndex((cur) =>
      cur === null ? null : cur === i ? null : cur > i ? cur - 1 : cur,
    );
    onAliasesChange(aliases.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <AliasEntryForm
        onAdd={handleAdd}
        accentColor="amber"
        isChemical={isChemical}
        isOther={isOther}
        editEntry={editingIndex !== null ? aliases[editingIndex] : null}
        onUpdate={handleUpdate}
        onCancelEdit={() => setEditingIndex(null)}
      />
      {aliases.length > 0 && (
         <StructuredAliasesTable
         aliases={aliases}
         onRemove={handleRemove}
         onEdit={setEditingIndex}
         editingIndex={editingIndex}
       />
      )}
    </div>
  );
};

// -- Main Modal ----------------------------------------------------------------
// A tab is "crop", "chemical", "organization", one of the backend categories
// (weed/pest/disease/…), or "other" (custom types). Every non-chemical,
// non-organization tab renders like crops.
type ActiveTab = string;

export const CropManagementModal = ({
  open,
  onOpenChange,
}: CropManagementModalProps) => {
  // ── Add-form state ──────────────────────────────────────────────────────────
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newCropName, setNewCropName] = useState("");
  const [newAliases, setNewAliases] = useState<ICropAliasObject[]>([]);
  const [chemicalStatus, setChemicalStatus] = useState("");
  const [newChemicalCrops, setNewChemicalCrops] = useState<string[]>([]);
  const [newScientificName, setNewScientificName] = useState("");
  // Free-text type used on the "Other" tab (a custom category the user names).
  const [customType, setCustomType] = useState("");
  const [aliasManagerCrop, setAliasManagerCrop] = useState<ICropResponse | null>(null);

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("crop");
  const isChemical = activeTab === "chemical";
  const isOther = activeTab === "other";
  // The type the add form / bulk upload targets: the tab itself, or the custom type on "Other".
  const activeType = isOther ? customType.trim() : activeTab;

  // ── Search / pagination for the active tab (only one tab shows at a time) ──────
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orgSearchInput, setOrgSearchInput] = useState("");
  const [orgSearchQuery, setOrgSearchQuery] = useState("");
  const [orgPage, setOrgPage] = useState(1);
  const [orgLimit, setOrgLimit] = useState(12);
  const orgDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isOrgImportOpen, setIsOrgImportOpen] = useState(false);
  const [isKvkImportOpen, setIsKvkImportOpen] = useState(false);
  const { data: orgData, isLoading: isOrgLoading } = useGetOrganizations(orgSearchQuery, orgPage, orgLimit);
  const { mutateAsync: createOrg } = useCreateOrganization();
  const { mutateAsync: updateOrg } = useUpdateOrganization();
  const { mutateAsync: deleteOrg } = useDeleteOrganization();

  const handleOrgSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOrgSearchInput(value);
    if (orgDebounce.current) clearTimeout(orgDebounce.current);
    orgDebounce.current = setTimeout(() => { setOrgSearchQuery(value); setOrgPage(1); }, 350);
  }, []);

  const [orgState, setOrgState] = useState("");
  const [orgDistrict, setOrgDistrict] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<"central" | "state" | "district" | "">("");
  const { data: statesList } = useGetStates();
  const selectedStateCode = statesList?.find(s => s.stateNameEnglish === orgState)?.stateCode;
  const { data: districtsList } = useGetDistricts(selectedStateCode);
  const [orgToDelete, setOrgToDelete] = useState<any | null>(null);
  const [orgEditId, setOrgEditId] = useState<string | null>(null);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { setSearchQuery(value); setPage(1); }, 350);
  }, []);

  // ── API calls ───────────────────────────────────────────────────────────────
  const { mutateAsync: createCrop, isPending: isCreating } = useCreateCrop();
  const { mutateAsync: bulkUploadCrops, isPending: isBulkUploading } = useBulkUploadCrops();

  // Backend categories drive the first-class tabs (falls back to the static list).
  const { data: fetchedCategories } = useGetCropEntryTypes();
  const rawCategories = fetchedCategories && fetchedCategories.length ? fetchedCategories : [...OTHER_TYPE_OPTIONS];
  // Drop reserved names (crop/chemical/other have their own tabs) and dedupe
  // case-insensitively, so "Other" never appears twice.
  const categories = Array.from(
    new Map(
      rawCategories
        .filter((c) => !RESERVED_TYPES.includes(c.trim().toLowerCase()))
        .map((c) => [c.trim().toLowerCase(), c.trim()]),
    ).values(),
  );
  // Tab order: Crop, Chemical, every category, then the custom "Other" bucket.
  const tabs: string[] = ["crop", "chemical", ...categories, "other"];

  // Data for whichever tab is active (crop / chemical / a category / other=custom types).
  const { data: tabData, isLoading: isTabLoading, isFetching: isTabFetching } = useGetAllCrops({
    search: searchQuery,
    page,
    limit,
    type: activeTab,
  });

  // Crop options for the chemical "associated crops" multiselect.
  const { data: allCropOptionsData } = useGetAllCrops({ type: "crop", page: 1, limit: 500 });

  const items: ICropResponse[] = tabData?.crops || [];
  const totalPages = tabData?.totalPages ?? 1;
  const allCropOptions: ICropResponse[] = allCropOptionsData?.crops || items;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const resetAddForm = () => {
    setNewCropName("");
    setNewAliases([]);
    setChemicalStatus("");
    setNewChemicalCrops([]);
    setNewScientificName("");
    setCustomType("");
    setIsAddFormOpen(false);
  };

  const resetAll = () => {
    resetAddForm();
    setActiveTab("crop");
    setSearchInput(""); setSearchQuery(""); setPage(1); setLimit(12);
  };

  const handleTabSwitch = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsAddFormOpen(false);
    setNewCropName("");
    setNewAliases([]);
    setChemicalStatus("");
    setNewChemicalCrops([]);
    setNewScientificName("");
    setCustomType("");
    setSearchInput(""); setSearchQuery(""); setPage(1);
  };

  const isSaving = isCreating;
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);

  const handleSave = async () => {
    const name = newCropName.trim();
    if (!name) return;
    if (isOther) {
      if (!customType.trim()) {
        toast.error("Please enter a type name");
        return;
      }
      if (RESERVED_TYPES.includes(customType.trim().toLowerCase())) {
        toast.error(`"${customType.trim()}" is a reserved type name`);
        return;
      }
    }
    try {
      const res = await createCrop({
        name,
        type: activeType,
        ...(isChemical ? { status: chemicalStatus, crops: newChemicalCrops } : {}),
        // Scientific name applies to biological entries (crop/weed/pest/disease/custom), not chemicals.
        ...(!isChemical && newScientificName.trim()
          ? { scientificName: newScientificName.trim() }
          : {}),
        aliases: newAliases.length > 0 ? newAliases : undefined,
      });
      if (res?.success) {
        toast.success(`"${name}" added successfully!`);
        resetAddForm();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to add entry");
    }
  };

  const handleBulkUploadClick = () => fileInputRef.current?.click();

  // ── Bulk-upload results (shown once, downloadable, not stored) ──────────────
  const [bulkResults, setBulkResults] = useState<IBulkJobResult[]>([]);
  const [bulkResultsOpen, setBulkResultsOpen] = useState(false);
  const [bulkResultsType, setBulkResultsType] = useState<CropUploadType>("crop");
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  // Pending CSV awaiting the "are these <type>?" confirmation before it uploads.
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [confirmUploadOpen, setConfirmUploadOpen] = useState(false);

  // Poll the job until it finishes, then surface the per-entry results modal.
  const pollBulkJob = (jobId: string, type: CropUploadType) => {
    const startedAt = Date.now();
    setIsProcessingBulk(true);
    const tick = async () => {
      try {
        const status = await cropServiceForStatus.getBulkJobStatus(jobId);
        if (status && status.status !== "running") {
          const rs = status.results ?? [];
          setBulkResults(rs);
          setBulkResultsType(type);
          setIsProcessingBulk(false);
          // Download the report directly on completion — the user may have navigated away
          // by the time it finishes, so don't rely on them clicking a button.
          downloadBulkResultsCsv(rs, type);
          setBulkResultsOpen(true);
          toast.success("Bulk upload complete — results downloaded.");
          return;
        }
      } catch {
        /* transient — keep polling until timeout */
      }
      if (Date.now() - startedAt < 5 * 60 * 1000) {
        setTimeout(tick, 1500);
      } else {
        setIsProcessingBulk(false);
      }
    };
    tick();
  };

  // Clear the pending file + reset the picker (used on cancel / after upload).
  const resetPendingUpload = () => {
    setPendingUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Selecting a file validates it, then asks for confirmation of the type before uploading.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error("Please upload a CSV file");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    // The upload carries the active tab's type; the "Other" tab needs a valid custom type first.
    if (isOther) {
      if (!customType.trim()) {
        toast.error("Enter a type name before uploading");
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (RESERVED_TYPES.includes(customType.trim().toLowerCase())) {
        toast.error(`"${customType.trim()}" is a reserved type name`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }
    // Hold the file and confirm the type before actually uploading.
    setPendingUploadFile(file);
    setConfirmUploadOpen(true);
  };

  // Runs the actual bulk upload for the confirmed pending file.
  const runBulkUpload = async () => {
    const file = pendingUploadFile;
    if (!file) return;
    const type = activeType as CropUploadType;
    try {
      const res = await bulkUploadCrops({ file, type });
      if (res?.success) {
        toast.success(`${res.count} rows are being processed. Results will show shortly.`);
        if (res.jobId) pollBulkJob(res.jobId, type);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload CSV");
    } finally {
      setConfirmUploadOpen(false);
      resetPendingUpload();
    }
  };

  // ── Table renderer for crops ────────────────────────────────────────────────
  const renderCropTable = (items: ICropResponse[], nameLabel = "Crop Name") => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[48px_1fr_88px_150px_130px_150px_130px_80px] bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
        {["Sl No", nameLabel, "Aliases", "Created At", "Created By", "Updated At", "Updated By", "Manage"].map((h, i) => (
          <div
            key={i}
            className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 2 || i === 7 ? "text-center" : ""}`}
          >
            {h}
          </div>
        ))}
      </div>
      {/* Rows */}
      {items.map((item, index) => {
        const id = item._id || item.name;
        const aliasCount = (item.aliases || []).length;
        return (
          <div
            key={id}
            className={`grid grid-cols-[48px_1fr_88px_150px_130px_150px_130px_80px] items-center group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] ${
              index < items.length - 1 ? "border-b border-gray-100 dark:border-gray-800/60" : ""
            }`}
          >
            {/* Sl No */}
            <div className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
              {index + 1}
            </div>
            {/* Crop Name */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={item.name}
                className="text-sm font-semibold text-gray-900 dark:text-white truncate block"
              >
                {item.name}
              </span>
              {item.scientificName ? (
                <span
                  title={item.scientificName}
                  className="text-[11px] italic text-gray-400 dark:text-gray-500 truncate block"
                >
                  {item.scientificName}
                </span>
              ) : null}
            </div>
            {/* Aliases Count */}
            <div className="px-3 py-2.5 text-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {aliasCount}
              </span>
            </div>
            {/* Created At */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={fmtAuditDate(item.createdAt)}
                className="text-xs text-gray-700 dark:text-gray-300 truncate block"
              >
                {fmtAuditDate(item.createdAt)}
              </span>
            </div>
            {/* Created By */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={item.createdByName?.trim() || "-"}
                className="text-xs text-gray-600 dark:text-gray-300 truncate block"
              >
                {item.createdByName?.trim() || "-"}
              </span>
            </div>
            {/* Updated At */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={fmtAuditDate(item.updatedAt)}
                className="text-xs text-gray-700 dark:text-gray-300 truncate block"
              >
                {fmtAuditDate(item.updatedAt)}
              </span>
            </div>
            {/* Updated By */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={item.updatedByName?.trim() || "-"}
                className="text-xs text-gray-600 dark:text-gray-300 truncate block"
              >
                {item.updatedByName?.trim() || "-"}
              </span>
            </div>
            {/* Manage Aliases */}
            <div className="px-3 py-2.5 flex items-center justify-center gap-0.5">
              <CropAuditTrailModal crop={item} />
              <button
                className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all"
                onClick={() => setAliasManagerCrop(item)}
                title="Manage Aliases"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Table renderer for chemicals ────────────────────────────────────────────
  const renderChemicalTable = (items: ICropResponse[]) => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[48px_1fr_88px_92px_150px_130px_150px_130px_80px] bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
        {["Sl No", "Chemical Name", "Aliases", "Status", "Created At", "Created By", "Updated At", "Updated By", "Manage"].map((h, i) => (
          <div
            key={i}
            className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 2 || i === 8 ? "text-center" : ""}`}
          >
            {h}
          </div>
        ))}
      </div>
      {/* Rows */}
      {items.map((item, index) => {
        const id = item._id || item.name;
        const aliasCount = (item.aliases || []).length;
        const status = item.status ?? null;
        return (
          <div
            key={id}
            className={`grid grid-cols-[48px_1fr_88px_92px_150px_130px_150px_130px_80px] items-center group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] ${
              index < items.length - 1 ? "border-b border-gray-100 dark:border-gray-800/60" : ""
            }`}
          >
            {/* Sl No */}
            <div className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
              {index + 1}
            </div>
            {/* Chemical Name */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={item.name}
                className="text-sm font-semibold text-gray-900 dark:text-white truncate block"
              >
                {item.name}
              </span>
            </div>
            {/* Aliases Count */}
            <div className="px-3 py-2.5 text-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {aliasCount}
              </span>
            </div>
            {/* Status */}
            <div className="px-3 py-2.5">
              {status ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border leading-tight ${
                  status.toLowerCase() === "banned"
                    ? "bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20"
                    : status.toLowerCase() === "restricted"
                    ? "bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20"
                    : "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700/60"
                }`}>
                  {status}
                </span>
              ) : (
                <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
              )}
            </div>
            {/* Created At */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={fmtAuditDate(item.createdAt)}
                className="text-xs text-gray-700 dark:text-gray-300 truncate block"
              >
                {fmtAuditDate(item.createdAt)}
              </span>
            </div>
            {/* Created By */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={item.createdByName?.trim() || "-"}
                className="text-xs text-gray-600 dark:text-gray-300 truncate block"
              >
                {item.createdByName?.trim() || "-"}
              </span>
            </div>
            {/* Updated At */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={fmtAuditDate(item.updatedAt)}
                className="text-xs text-gray-700 dark:text-gray-300 truncate block"
              >
                {fmtAuditDate(item.updatedAt)}
              </span>
            </div>
            {/* Updated By */}
            <div className="px-3 py-2.5 min-w-0">
              <span
                title={item.updatedByName?.trim() || "-"}
                className="text-xs text-gray-600 dark:text-gray-300 truncate block"
              >
                {item.updatedByName?.trim() || "-"}
              </span>
            </div>
            {/* Manage Aliases */}
            <div className="px-3 py-2.5 flex items-center justify-center gap-0.5">
              <CropAuditTrailModal crop={item} />
              <button
                className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all"
                onClick={() => setAliasManagerCrop(item)}
                title="Manage Aliases"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) {
            resetAll();
            setAliasManagerCrop(null);
          }
          onOpenChange(val);
        }}
      >
        <DialogContent
          className="w-[80vw] sm:max-w-[80vw] max-w-[95vw] h-[80vh] p-0 flex flex-col overflow-hidden gap-0"
          showCloseButton={false}
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <DialogHeader className="space-y-0.5">
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Cpu className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
                AgriTech Management
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Manage crop names &amp; aliases
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className={`h-8 text-xs gap-1.5 shadow-sm text-white transition-colors ${
                  isChemical
                    ? "bg-purple-600 hover:bg-purple-700"
                    : activeTab === "crop"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
                onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              >
                <Plus
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    isAddFormOpen ? "rotate-45" : ""
                  }`}
                />
                {isAddFormOpen ? "Cancel" : "AgriTech Item"}
              </Button>
              <button
                onClick={() => onOpenChange(false)}
                className="group h-8 w-8 flex items-center justify-center rounded-full bg-gray-50 dark:bg-[#1a1a1a] hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-gray-200 dark:border-gray-800 hover:border-rose-200 dark:hover:border-rose-800/30 text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 shadow-sm transition-all duration-300 focus:outline-none"
                title="Close"
              >
                <X className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-active:scale-95" />
              </button>
            </div>
          </div>

          {/* Tab Bar — Crop, Chemical, backend categories (weed/pest/disease/…), then Other */}
          <div className="flex items-end gap-0 px-5 pt-3 pb-0 flex-shrink-0 overflow-x-auto">
            {tabs.map((tab) => {
              const active = activeTab === tab;
              const isChem = tab === "chemical";
              const isCropTab = tab === "crop";
              const Icon = isChem ? FlaskConical : isCropTab ? Wheat : LayoutGrid;
              const label = isChem ? "Chemicals" : isCropTab ? "Crops" : tab === "other" ? "Other" : labelOf(tab);
              const activeCls = isChem
                ? "border-b-purple-500 text-purple-700 dark:text-purple-400 bg-purple-50/60 dark:bg-purple-500/5"
                : isCropTab
                  ? "border-b-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-500/5"
                  : "border-b-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-500/5";
              const iconActiveColor = isChem
                ? "text-purple-600 dark:text-purple-400"
                : isCropTab
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-blue-600 dark:text-blue-400";
              return (
                <button
                  key={tab}
                  id={`agritech-tab-${tab}`}
                  onClick={() => handleTabSwitch(tab)}
                  className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all duration-200 focus:outline-none whitespace-nowrap ${
                    active
                      ? activeCls
                      : "border-b-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? iconActiveColor : ""}`} />
                  {label}
                </button>
              );
            })}

            {/* Organization tab */}
            <button
              id="agritech-tab-organization"
              onClick={() => handleTabSwitch("organization" as any)}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all duration-200 focus:outline-none whitespace-nowrap ${
                activeTab === "organization"
                  ? "border-b-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/5"
                  : "border-b-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <Building2 className={`h-3.5 w-3.5 ${activeTab === "organization" ? "text-emerald-600 dark:text-emerald-400" : ""}`} />
              Organization
            </button>

            {/* Rail fills remaining width */}
            <div className="flex-1 border-b-2 border-b-gray-100 dark:border-b-gray-800" />
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── Add Form ────────────────────────────────────────────────── */}
            {isAddFormOpen && activeTab !== "organization" && (
              <div className={`mx-5 mt-4 mb-3 p-4 rounded-xl border-l-[3px] space-y-3 ${
                isChemical
                  ? "border-l-purple-500 border border-purple-200/60 dark:border-purple-500/15 bg-purple-50/30 dark:bg-purple-500/[0.03]"
                  : activeTab === "crop"
                  ? "border-l-amber-500 border border-amber-200/60 dark:border-amber-500/15 bg-amber-50/30 dark:bg-amber-500/[0.03]"
                  : "border-l-blue-500 border border-blue-200/60 dark:border-blue-500/15 bg-blue-50/30 dark:bg-blue-500/[0.03]"
              }`}>

                {/* Other-only: name the custom type */}
                {isOther && (
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                      Type Name
                      <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                        — e.g. Fertilizer, Equipment
                      </span>
                    </label>
                    <Input
                      placeholder="Enter a custom type"
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                      className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}

                {/* Name field — label reflects the active tab */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    {activeTab === "crop"
                      ? "Crop Name"
                      : isChemical
                        ? "Chemical Name"
                        : isOther
                          ? `${labelOf(customType) || "Entry"} Name`
                          : `${labelOf(activeTab)} Name`}
                  </label>
                  <Input
                    placeholder={activeTab === "crop" ? "Paddy" : isChemical ? "Alachlor" : "Name"}
                    value={newCropName}
                    onChange={(e) => setNewCropName(e.target.value)}
                    className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700"
                    autoFocus
                  />
                </div>

                {/* Scientific name — optional, for biological entries (not chemicals) */}
                {!isChemical && (
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                      Scientific Name
                      <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                        — optional, e.g. Oryza sativa
                      </span>
                    </label>
                    <Input
                      placeholder="e.g. Oryza sativa"
                      value={newScientificName}
                      onChange={(e) => setNewScientificName(e.target.value)}
                      className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700 italic"
                    />
                  </div>
                )}

                {/* Chemical-only: status, crops */}
                {isChemical && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                        Status
                      </label>
                      <Input
                        placeholder="e.g. Restricted, Banned, Under Review..."
                        value={chemicalStatus}
                        onChange={(e) => setChemicalStatus(e.target.value)}
                        className="h-9 text-sm bg-white dark:bg-[#141414] border-gray-200 dark:border-gray-700"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                        Crops
                      </label>
                      <CropMultiSelect
                        dbCrops={allCropOptions}
                        crops={newChemicalCrops}
                        selected={newChemicalCrops}
                        onChange={setNewChemicalCrops}
                      />
                    </div>
                  </div>
                )}

                {/* Aliases — shown for all types */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    {isChemical ? "Trade Names" : "Aliases"}
                    <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                      — optional, can add later
                    </span>
                  </label>
                  <AliasSection
                    aliases={newAliases}
                    onAliasesChange={setNewAliases}
                    isChemical={isChemical}
                    isOther={!isChemical && activeTab !== "crop"}
                  />
                </div>

                {/* Hint: on the Other tab, a type name is required before adding/uploading */}
                {isOther && !customType.trim() && (
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <Info className="h-3.5 w-3.5 flex-shrink-0" />
                    Enter a type name above to enable adding and bulk upload.
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBulkUploading || isProcessingBulk || (isOther && !customType.trim())}
                      title={isOther && !customType.trim() ? "Enter a type name first" : undefined}
                      className={`h-8 text-xs gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isChemical
                          ? "border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
                          : activeTab === "crop"
                            ? "border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                            : "border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                      }`}
                      onClick={handleBulkUploadClick}
                    >
                      {isBulkUploading || isProcessingBulk ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {isBulkUploading
                        ? "Uploading..."
                        : isProcessingBulk
                          ? "Processing..."
                          : isChemical
                            ? "Bulk Upload Chemicals"
                            : activeTab === "crop"
                              ? "Bulk Upload Crops"
                              : `Bulk Upload ${isOther ? labelOf(customType) || "Entries" : labelOf(activeTab)}`}
                    </Button>
                    <SampleCsvButton entryType={isChemical ? "chemical" : activeTab === "crop" ? "crop" : "other"} />
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    onClick={() => setConfirmCreateOpen(true)}
                    disabled={!newCropName.trim() || isSaving || (isOther && !customType.trim())}
                    className={`h-8 text-xs text-white rounded-lg ${
                      isChemical
                        ? "bg-purple-600 hover:bg-purple-700"
                        : activeTab === "crop"
                          ? "bg-amber-600 hover:bg-amber-700"
                          : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Saving...
                      </>
                    ) : (
                      `Save ${activeTab === "crop" ? "Crop" : isChemical ? "Chemical" : isOther ? labelOf(customType) || "Entry" : labelOf(activeTab)}`
                    )}
                  </Button>
                  <ConfirmationModal
                    open={confirmCreateOpen}
                    onOpenChange={setConfirmCreateOpen}
                    title={`Create "${newCropName.trim()}"?`}
                    description={`Add this new ${activeTab === "crop" ? "crop" : isChemical ? "chemical" : (activeType || "entry")} to Agri Tech Management.`}
                    confirmText="Create"
                    isLoading={isSaving}
                    onConfirm={handleSave}
                  />
                  {/* Confirm the entry type before a bulk CSV upload runs. */}
                  <ConfirmationModal
                    open={confirmUploadOpen}
                    onOpenChange={(v) => {
                      setConfirmUploadOpen(v);
                      if (!v) resetPendingUpload();
                    }}
                    title={`Are you sure these are ${
                      isChemical ? "Chemicals" : activeTab === "crop" ? "Crops" : labelOf(activeType || activeTab)
                    }?`}
                    description={`This CSV will be uploaded as "${
                      isChemical ? "Chemicals" : activeTab === "crop" ? "Crops" : labelOf(activeType || activeTab)
                    }". Please make sure you upload the respective type only.`}
                    confirmText="Yes, Upload"
                    isLoading={isBulkUploading || isProcessingBulk}
                    onConfirm={runBulkUpload}
                  />
                </div>
              </div>
            )}

            {/* ── Active-tab content ─────────────────────────────────────────── */}
            {activeTab !== "organization" && (isOther ? (
              /* "Other" is where a NEW custom type is created; each type then gets its own tab. */
              <div className="px-5 py-12 text-center">
                <LayoutGrid className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Add a new type here
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
                  Use “AgriTech Item” to name a new type and add or bulk-upload its data.
                  Each type you add appears as its own tab beside Crops.
                </p>
              </div>
            ) : (
              <>
                <div className="px-5 pt-3 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <Input
                      id="agritech-search"
                      placeholder={isChemical ? "Search chemicals..." : activeTab === "crop" ? "Search crops..." : `Search ${labelOf(activeTab).toLowerCase()}...`}
                      value={searchInput}
                      onChange={handleSearchChange}
                      className="h-8 pl-8 text-xs bg-gray-50 dark:bg-[#141414] border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                    {isTabFetching && !isTabLoading && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
                    )}
                  </div>
                </div>

                <div className="px-5 py-3">
                  {isTabLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className={`h-5 w-5 animate-spin ${isChemical ? "text-purple-400" : activeTab === "crop" ? "text-amber-400" : "text-blue-400"}`} />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="text-center py-12">
                      {isChemical ? (
                        <FlaskConical className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      ) : activeTab === "crop" ? (
                        <Wheat className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      ) : (
                        <LayoutGrid className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      )}
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {searchQuery
                          ? `No entries matching "${searchQuery}"`
                          : `No ${isChemical ? "chemicals" : activeTab === "crop" ? "crops" : labelOf(activeTab).toLowerCase()} added yet`}
                      </p>
                    </div>
                  ) : isChemical ? (
                    renderChemicalTable(items)
                  ) : (
                    renderCropTable(items, activeTab === "crop" ? "Crop Name" : `${labelOf(activeTab)} Name`)
                  )}
                </div>
              </>
            ))}
            {/* 🏢 ORGANIZATIONS TAB */}
            {activeTab === "organization" && (
              <>
                <div className="px-5 pt-3 pb-1">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <Input
                        placeholder="Search organizations..."
                        value={orgSearchInput}
                        onChange={handleOrgSearchChange}
                        className="h-8 pl-8 text-xs bg-gray-50 dark:bg-[#141414] border-gray-200 dark:border-gray-700 rounded-lg"
                      />
                      {isOrgLoading && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOrgImportOpen(true)}
                      className="h-8 text-xs shrink-0"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsKvkImportOpen(true)}
                      className="h-8 text-xs shrink-0"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      Fetch KVKs
                    </Button>
                  </div>
                  <div className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr_2fr_100px] gap-3 border-b border-gray-100 dark:border-gray-800 pb-2 mb-2 font-semibold text-xs text-gray-500">
                    <div>Organization Name</div>
                    <div>Type</div>
                    <div>State</div>
                    <div>District</div>
                    <div>Address</div>
                    <div className="text-right">Actions</div>
                  </div>
                  
                  {isAddFormOpen && (
                    <div className="mt-4 mb-3 p-4 rounded-xl border-l-[3px] border-l-emerald-500 border border-emerald-200/60 dark:border-emerald-500/15 bg-emerald-50/30 dark:bg-emerald-500/[0.03]">
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-[2fr_1fr] gap-3">
                          <Input placeholder="Organization Name *" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="h-8 text-xs bg-white dark:bg-[#1a1a1a]" />
                          <Select value={orgType || undefined} onValueChange={(v: any) => setOrgType(v)}>
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-[#1a1a1a]">
                              <SelectValue placeholder="Type *" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="central" className="text-xs">Central</SelectItem>
                              <SelectItem value="state" className="text-xs">State</SelectItem>
                              <SelectItem value="district" className="text-xs">District</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Select value={orgState || undefined} onValueChange={(v) => { setOrgState(v); setOrgDistrict(""); }}>
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-[#1a1a1a]">
                              <SelectValue placeholder="State" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              {statesList?.map((s) => (
                                <SelectItem key={s.stateCode} value={s.stateNameEnglish} className="text-xs">{s.stateNameEnglish}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={orgDistrict || undefined} onValueChange={(v) => setOrgDistrict(v)} disabled={!selectedStateCode}>
                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-[#1a1a1a]">
                              <SelectValue placeholder="District" />
                            </SelectTrigger>
                            <SelectContent className="max-h-64">
                              {districtsList?.map((d) => (
                                <SelectItem key={d.districtCode} value={d.districtNameEnglish} className="text-xs">{d.districtNameEnglish}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input placeholder="Address" value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} className="h-8 text-xs bg-white dark:bg-[#1a1a1a]" />
                        
                        <div className="flex justify-end gap-2 mt-2">
                          <Button variant="outline" size="sm" onClick={() => { setIsAddFormOpen(false); setOrgEditId(null); setOrgName(""); setOrgType(""); setOrgState(""); setOrgDistrict(""); setOrgAddress(""); }} className="h-8 text-xs">Cancel</Button>
                          <Button size="sm" onClick={async () => {
                            if (!orgName || !orgState || !orgType) return toast.error("Name, Type and State are required");
                            const payload = { org_name: orgName, type: orgType, state: orgState, district: orgDistrict, address: orgAddress };
                            try {
                                if (orgEditId) {
                                  await updateOrg({ id: orgEditId, data: payload });
                                } else {
                                  await createOrg(payload);
                                }
                                setIsAddFormOpen(false); setOrgEditId(null); setOrgName(""); setOrgType(""); setOrgState(""); setOrgDistrict(""); setOrgAddress("");
                            } catch (error) {}
                          }} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">{orgEditId ? "Update" : "Add"}</Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-0 border rounded-xl overflow-hidden mt-3 dark:border-gray-800">
                    {orgData?.organizations?.map((org: any, i: number) => (
                      <div key={typeof org._id === 'object' ? org._id?.$oid : (org._id || org.id)} className={`grid grid-cols-[2fr_1fr_1.5fr_1.5fr_2fr_100px] gap-3 items-center p-3 text-xs transition-colors hover:bg-gray-50/60 dark:hover:bg-white/[0.02] ${i > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""}`}>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{org.org_name}</div>
                        <div className="text-gray-600 dark:text-gray-400 capitalize">{org.type || "-"}</div>
                        <div className="text-gray-600 dark:text-gray-400">{org.state}</div>
                        <div className="text-gray-600 dark:text-gray-400">{org.district || "-"}</div>
                        <div className="text-gray-600 dark:text-gray-400 truncate" title={org.address}>{org.address || "-"}</div>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10" onClick={() => {
                            setOrgEditId(typeof org._id === 'object' ? org._id?.$oid : (org._id || org.id));
                            setOrgName(org.org_name);
                            setOrgType(org.type || "");
                            setOrgState(org.state);
                            setOrgDistrict(org.district || "");
                            setOrgAddress(org.address || "");
                            setIsAddFormOpen(true);
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10" onClick={() => setOrgToDelete(org)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!isOrgLoading && orgData?.organizations?.length === 0 && (
                      <div className="text-center py-8 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">No organizations found.</div>
                    )}
                  </div>
                </div>
              </>
            )}

          </div>

          {/* ── Pagination Footer (fixed inside modal) ──────────────────────── */}
          {!isOther && totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#0f0f0f] px-4 py-2 flex items-center justify-end gap-2 flex-wrap">
              {/* Items per page */}
              <div className="relative">
                <Select
                  value={limit.toString()}
                  onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}
                >
                  <SelectTrigger className="h-6 w-[62px] text-[11px] px-2 border-gray-200 dark:border-gray-700" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[12, 25, 50, 100].map((v) => (
                      <SelectItem key={v} value={v.toString()} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Prev */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {/* Page numbers */}
              {(() => {
                const MAX = 5;
                let start = page > MAX ? page : 1;
                let end = Math.min(start + MAX - 1, totalPages);
                const pages = [];
                for (let i = start; i <= end; i++) pages.push(i);
                return (
                  <>
                    {pages.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`h-6 w-6 text-[11px] rounded border transition-colors ${
                          p === page
                            ? "bg-emerald-500 border-emerald-500 text-white font-semibold"
                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    {end < totalPages && (
                      <button
                        onClick={() => setPage(end + 1)}
                        className="h-6 w-6 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        ...
                      </button>
                    )}
                  </>
                );
              })()}
              {/* Next */}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
          
          <ConfirmationModal
            open={!!orgToDelete}
            onOpenChange={(isOpen) => !isOpen && setOrgToDelete(null)}
            title={`Delete "${orgToDelete?.org_name}"?`}
            description="Are you sure you want to delete this organization? This action cannot be undone."
            confirmText="Delete"
            type="delete"
            onConfirm={async () => {
              if (orgToDelete) {
                try {
                  const id = typeof orgToDelete._id === 'object' ? orgToDelete._id?.$oid : (orgToDelete._id || orgToDelete.id);
                  await deleteOrg(id);
                  setOrgToDelete(null);
                } catch (e) {}
              }
            }}
          />
          {activeTab === "organization" && orgData?.totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#0f0f0f] px-4 py-2 flex items-center justify-end gap-2 flex-wrap">
              {/* Items per page */}
              <div className="relative">
                <Select
                  value={orgLimit.toString()}
                  onValueChange={(v) => { setOrgLimit(Number(v)); setOrgPage(1); }}
                >
                  <SelectTrigger className="h-6 w-[62px] text-[11px] px-2 border-gray-200 dark:border-gray-700" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[12, 25, 50, 100].map((v) => (
                      <SelectItem key={v} value={v.toString()} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Prev */}
              <button
                onClick={() => setOrgPage((p) => Math.max(1, p - 1))}
                disabled={orgPage === 1}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {/* Page numbers */}
              {(() => {
                const MAX = 5;
                let start = orgPage > MAX ? orgPage : 1;
                let end = Math.min(start + MAX - 1, orgData.totalPages);
                const pages = [];
                for (let i = start; i <= end; i++) pages.push(i);
                return (
                  <>
                    {pages.map((p) => (
                      <button
                        key={p}
                        onClick={() => setOrgPage(p)}
                        className={`h-6 w-6 text-[11px] rounded border transition-colors ${
                          p === orgPage
                            ? "bg-emerald-500 border-emerald-500 text-white font-semibold"
                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    {end < orgData.totalPages && (
                      <button
                        onClick={() => setOrgPage(end + 1)}
                        className="h-6 w-6 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        ...
                      </button>
                    )}
                  </>
                );
              })()}
              {/* Next */}
              <button
                onClick={() => setOrgPage((p) => Math.min(orgData.totalPages, p + 1))}
                disabled={orgPage === orgData.totalPages}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Alias Manager Sub-Modal ─────────────────────────────────────────── */}
      {aliasManagerCrop && (
        <AliasManagerModal
          crop={aliasManagerCrop}
          allCropOptions={allCropOptions}
          onClose={() => setAliasManagerCrop(null)}
        />
      )}

      <OrganizationBulkUploadModal
        open={isOrgImportOpen}
        onClose={() => setIsOrgImportOpen(false)}
      />

      <OrganizationBulkUploadModal
        open={isKvkImportOpen}
        onClose={() => setIsKvkImportOpen(false)}
        source="kvk"
      />

      <BulkResultsModal
        open={bulkResultsOpen}
        onClose={() => setBulkResultsOpen(false)}
        results={bulkResults}
        type={bulkResultsType}
      />
    </>
  );
};
