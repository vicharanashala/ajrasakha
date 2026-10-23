import { useState, useCallback, useRef, useEffect, useId, useMemo } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
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
import { Plus, Cpu, Wheat, Pencil, X, Loader2, Check, Languages, Trash2, Search, FlaskConical, LayoutGrid, Upload, Info, History, LogOut, Filter, RefreshCcw } from "lucide-react";
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
import { CropSheetImportModal } from "./CropSheetImportModal";
import { AgriTechAuditModal } from "./AgriTechAuditModal";
import {
  AgriTechFilterDrawer,
  DEFAULT_AGRITECH_FILTERS,
  countActiveFilters,
  toListFilters,
  type AgriTechFilterState,
} from "./AgriTechFilterDrawer";
import type { AgriTechSort } from "@/hooks/services/cropService";
import { ScrollArea, ScrollBar } from "@/components/atoms/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/table";
import { Pagination } from "@/components/pagination";

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

/** Shared motion presets so every AgriTech animation feels the same. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const collapseMotion = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.22, ease: EASE_OUT },
};
const tabContentMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.18, ease: EASE_OUT },
};
const tabUnderlineTransition = { type: "spring", stiffness: 500, damping: 40 } as const;

/** Fades list rows in, staggering only the first few so long lists stay quick. */
const rowMotion = (index: number) => ({
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, delay: Math.min(index, 12) * 0.02, ease: EASE_OUT },
});

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
  source_link: "",
  page_number: "",
  agri_expert: "",
  remark: "",
});

type CropManagementModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "page" renders the management UI inline (e.g. in place of the questions table)
   *  with an Exit button; "modal" (default) renders it in a dialog. */
  variant?: "modal" | "page";
};

type ShellProps = { isPage: boolean; children: React.ReactNode };

/** Hosts the management UI in a dialog, or inline as a page section. */
const ManagementShell = ({
  isPage,
  open,
  onOpenChange,
  children,
}: ShellProps & { open: boolean; onOpenChange: (open: boolean) => void }) =>
  isPage ? (
    <motion.section
      aria-labelledby="agritech-management-title"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-[calc(100dvh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] shadow-sm"
    >
      {children}
    </motion.section>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[80vw] sm:max-w-[80vw] max-w-[95vw] h-[80vh] p-0 flex flex-col overflow-hidden gap-0"
        showCloseButton={false}
      >
        {children}
      </DialogContent>
    </Dialog>
  );

/** Dialog header parts outside a Dialog would throw, so the page variant uses plain elements. */
const ShellHeader = ({ isPage, children }: ShellProps) =>
  isPage ? <div className="space-y-0.5">{children}</div> : <DialogHeader className="space-y-0.5">{children}</DialogHeader>;

const ShellTitle = ({ isPage, children }: ShellProps) => {
  const className = "flex items-center gap-2 text-base font-bold";
  return isPage ? (
    <h2 id="agritech-management-title" className={className}>{children}</h2>
  ) : (
    <DialogTitle className={className}>{children}</DialogTitle>
  );
};

const ShellDescription = ({ isPage, children }: ShellProps) =>
  isPage ? (
    <p className="text-xs text-gray-500">{children}</p>
  ) : (
    <DialogDescription className="text-xs text-gray-500">{children}</DialogDescription>
  );

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
  // Unique ids so the labels stay linked when two alias forms are open at once.
  const fieldId = useId();
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

      {/* Source Link and Page Number */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            Source Link
          </span>
          <input
            placeholder="e.g. https://agritech.tnau.ac.in/..."
            value={entry.source_link}
            onChange={(e) => setEntry((f) => ({ ...f, source_link: e.target.value }))}
            className="w-full h-14 px-2 py-1.5 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber-400"
          />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            Page Number
          </span>
          <input
            placeholder="e.g. 45"
            value={entry.page_number}
            onChange={(e) => setEntry((f) => ({ ...f, page_number: e.target.value }))}
            className="w-full h-14 px-2 py-1.5 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Agri Expert and Remark */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label
            htmlFor={`${fieldId}-agri-expert`}
            className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block"
          >
            Agri Expert
          </label>
          <Input
            id={`${fieldId}-agri-expert`}
            placeholder="e.g. Rohan Chand"
            value={entry.agri_expert ?? ""}
            onChange={(e) => setEntry((f) => ({ ...f, agri_expert: e.target.value }))}
            className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`${fieldId}-remark`}
            className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block"
          >
            Remark
          </label>
          <Input
            id={`${fieldId}-remark`}
            placeholder="e.g. Verified from state POP"
            value={entry.remark ?? ""}
            onChange={(e) => setEntry((f) => ({ ...f, remark: e.target.value }))}
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
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_0.6fr_1fr_1fr_64px] gap-0 bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
        {["Language", "Region", "English", "Native", "Source Link", "Page #", "Agri Expert", "Remark", ""].map((h, i) => (
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
          className={`grid grid-cols-[1fr_1fr_1fr_1fr_1fr_0.6fr_1fr_1fr_64px] gap-0 items-center group transition-colors
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

          <div className="px-3 py-2.5 min-w-0">
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate block" title={alias.source_link}>
              {alias.source_link || (
                <span className="text-gray-300 dark:text-gray-600">—</span>
              )}
            </span>
          </div>

          <div className="px-3 py-2.5 min-w-0">
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate block">
              {alias.page_number || (
                <span className="text-gray-300 dark:text-gray-600">—</span>
              )}
            </span>
          </div>

          <div className="px-3 py-2.5 min-w-0">
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate block" title={alias.agri_expert}>
              {alias.agri_expert || (
                <span className="text-gray-300 dark:text-gray-600">—</span>
              )}
            </span>
          </div>

          <div className="px-3 py-2.5 min-w-0">
            <span className="text-xs text-gray-600 dark:text-gray-300 truncate block" title={alias.remark}>
              {alias.remark || (
                <span className="text-gray-300 dark:text-gray-600">—</span>
              )}
            </span>
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

  // Image upload (crop entries only for now). `imageFile` = a newly picked file,
  // `removeImage` = clear the existing one. Preview shows the pick, else the stored image.
  const isCropType = (crop.type ?? "crop") === "crop";
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  const handlePickImage = (file: File | null) => {
    if (!file) return;
    setImageFile(file);
    setRemoveImage(false);
    setImagePreview(URL.createObjectURL(file));
  };
  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  };
  const shownImage = imagePreview ?? (removeImage ? null : crop.imageUrl ?? null);

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
      const res = await updateCrop({
        cropId: crop._id,
        payload,
        image: isCropType ? imageFile : null,
        removeImage: isCropType && removeImage,
      });
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

          {/* ── Image — crop entries only ─────────────────────────────── */}
          {isCropType && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Image
                <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                  — optional
                </span>
              </p>
              {shownImage ? (
                <div className="flex items-center gap-3">
                  <img
                    src={shownImage}
                    alt={crop.name}
                    className="h-16 w-16 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-primary cursor-pointer hover:underline">
                      Replace
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleClearImage}
                      className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline text-left"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex h-16 items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
                  />
                  Click to upload an image
                </label>
              )}
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

/** Colour accents for each kind of tab, so every element of a tab matches. */
const accentOf = (tab: string) =>
  tab === "chemical"
    ? { avatar: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300", action: "hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10" }
    : tab === "crop"
      ? { avatar: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", action: "hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10" }
      : { avatar: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", action: "hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10" };

/** Date and author of a create or update, stacked in one cell. */
const AuditStamp = ({ at, by }: { at?: string; by?: string }) => (
  <div className="min-w-0">
    <span className="block truncate text-xs text-gray-700 dark:text-gray-300" title={fmtAuditDate(at)}>
      {fmtAuditDate(at)}
    </span>
    <span className="block truncate text-[11px] text-gray-400 dark:text-gray-500" title={by?.trim() || undefined}>
      {by?.trim() ? `by ${by.trim()}` : "—"}
    </span>
  </div>
);

/** Entry thumbnail: its uploaded image, otherwise its initial on the tab colour. */
const EntryAvatar = ({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className: string }) =>
  imageUrl ? (
    <img
      src={imageUrl}
      alt=""
      loading="lazy"
      className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-gray-700"
    />
  ) : (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${className}`} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );

/** Table row that can animate in, matching the other AgriTech motion. */
const MotionTableRow = motion.create(TableRow);

/** Header button that toggles between two sort orders, with an arrow like the questions table. */
const SortHeader = ({
  label,
  asc,
  desc,
  sort,
  onSort,
  align = "center",
}: {
  label: string;
  asc: AgriTechSort;
  desc: AgriTechSort;
  sort: AgriTechSort;
  onSort: (sort: AgriTechSort) => void;
  align?: "start" | "center";
}) => (
  <button
    type="button"
    onClick={() => onSort(sort === asc ? desc : asc)}
    className={`flex items-center gap-1 select-none ${align === "center" ? "mx-auto" : ""}`}
    aria-label={`Sort by ${label}`}
  >
    {label}
    {sort === asc && <span className="text-sm font-medium">↑</span>}
    {sort === desc && <span className="text-sm font-medium">↓</span>}
  </button>
);

/** Placeholder rows shown while a table is loading. */
const TableSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800/60 last:border-b-0">
        <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-white/5 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
          <div className="h-2.5 w-1/5 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
        </div>
        <div className="hidden md:block h-3 w-24 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
        <div className="hidden md:block h-3 w-24 rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
      </div>
    ))}
  </div>
);

export const CropManagementModal = ({
  open,
  onOpenChange,
  variant = "modal",
}: CropManagementModalProps) => {
  const isPage = variant === "page";
  // ── Add-form state ──────────────────────────────────────────────────────────
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newCropName, setNewCropName] = useState("");
  const [newAliases, setNewAliases] = useState<ICropAliasObject[]>([]);
  const [chemicalStatus, setChemicalStatus] = useState("");
  const [newChemicalCrops, setNewChemicalCrops] = useState<string[]>([]);
  const [newScientificName, setNewScientificName] = useState("");
  // Optional image for a new crop entry (crop tab only). Uploaded right after the crop is
  // created, via the same update endpoint the edit form uses.
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
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
  const [isSheetImportOpen, setIsSheetImportOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
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
  const { mutateAsync: updateCrop, isPending: isUpdatingImage } = useUpdateCrop();
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
  // List filters (drawer) for the entry tabs; image applies to crops, status to chemicals.
  const [filterState, setFilterState] = useState<AgriTechFilterState>(DEFAULT_AGRITECH_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterScope = { showImage: activeTab === "crop", showStatus: activeTab === "chemical" };
  const listFilters = useMemo(
    () => toListFilters(filterState, filterScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterState, filterScope.showImage, filterScope.showStatus],
  );
  const activeFilterCount = countActiveFilters(filterState, filterScope);
  const updateFilters = (next: AgriTechFilterState) => {
    setFilterState(next);
    setPage(1);
  };
  const entityNoun = activeTab === "chemical" ? "chemicals" : activeTab === "crop" ? "crops" : labelOf(activeTab).toLowerCase();
  const SORT_LABELS: Record<AgriTechSort, string> = {
    name_asc: "Name A to Z",
    name_desc: "Name Z to A",
    updated_desc: "Recently updated",
    updated_asc: "Least recently updated",
    newest: "Newest first",
    oldest: "Oldest first",
  };
  // One removable chip per active filter, shown under the search bar.
  const filterChips: { key: string; label: string; reset: Partial<AgriTechFilterState> }[] = [
    ...(filterState.sort !== DEFAULT_AGRITECH_FILTERS.sort
      ? [{ key: "sort", label: `Sort: ${SORT_LABELS[filterState.sort]}`, reset: { sort: DEFAULT_AGRITECH_FILTERS.sort } }]
      : []),
    ...(listFilters.aliases
      ? [{ key: "aliases", label: listFilters.aliases === "with" ? "With aliases" : "No aliases", reset: { aliases: "all" as const } }]
      : []),
    ...(listFilters.language ? [{ key: "language", label: `Language: ${listFilters.language}`, reset: { language: "all" } }] : []),
    ...(listFilters.region ? [{ key: "region", label: `State: ${listFilters.region}`, reset: { region: "all" } }] : []),
    ...(listFilters.image
      ? [{ key: "image", label: listFilters.image === "with" ? "With image" : "No image", reset: { image: "all" as const } }]
      : []),
    ...(listFilters.status ? [{ key: "status", label: `Status: ${listFilters.status}`, reset: { status: "all" } }] : []),
    ...(listFilters.updatedFrom || listFilters.updatedTo
      ? [{
          key: "updated",
          label: `Updated ${filterState.updatedFrom || "…"} to ${filterState.updatedTo || "…"}`,
          reset: { updatedFrom: "", updatedTo: "" },
        }]
      : []),
  ];

  const { data: tabData, isLoading: isTabLoading, isFetching: isTabFetching, refetch: refetchTab } = useGetAllCrops({
    search: searchQuery,
    page,
    limit,
    type: activeTab,
    sort: filterState.sort,
    filters: listFilters,
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
    if (newImagePreview) URL.revokeObjectURL(newImagePreview);
    setNewImageFile(null);
    setNewImagePreview(null);
    setCustomType("");
    setIsAddFormOpen(false);
  };

  const handlePickNewImage = (file: File | null) => {
    if (newImagePreview) URL.revokeObjectURL(newImagePreview);
    setNewImageFile(file);
    setNewImagePreview(file ? URL.createObjectURL(file) : null);
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

  const isSaving = isCreating || isUpdatingImage;
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
        // Crops can carry an image: it's uploaded to GCS via the update endpoint right after
        // the crop exists (create is JSON-only). A failed image upload doesn't fail the create.
        const newId = res.data?._id;
        if (activeTab === "crop" && newImageFile && newId) {
          try {
            await updateCrop({ cropId: newId, payload: {}, image: newImageFile });
          } catch {
            toast.error("Crop added, but the image upload failed. You can add it via edit.");
          }
        }
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

  // ── Entry table (crops, chemicals and every category) ─────────────────────
  // Same table component and row style as the All Questions list; chemicals add a status column.
  const renderEntryTable = (entries: ICropResponse[], nameLabel: string, showStatus: boolean) => {
    const accent = accentOf(activeTab);
    const onSort = (sort: AgriTechSort) => updateFilters({ ...filterState, sort });
    return (
      <div className="rounded-lg bg-card border">
        <ScrollArea className="w-full whitespace-nowrap">
          <Table containerClassName="overflow-hidden" className="min-w-[900px] table-auto">
            <TableHeader className="bg-card sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-16 text-center">Sl.No</TableHead>
                <TableHead className="text-start ps-4">
                  <SortHeader label={nameLabel} asc="name_asc" desc="name_desc" sort={filterState.sort} onSort={onSort} align="start" />
                </TableHead>
                <TableHead className="text-center">Aliases</TableHead>
                {showStatus && <TableHead className="text-center">Status</TableHead>}
                <TableHead className="text-center">
                  <SortHeader label="Created" asc="oldest" desc="newest" sort={filterState.sort} onSort={onSort} />
                </TableHead>
                <TableHead className="text-center">
                  <SortHeader label="Last updated" asc="updated_asc" desc="updated_desc" sort={filterState.sort} onSort={onSort} />
                </TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((item, index) => {
                const aliasCount = (item.aliases || []).length;
                const status = item.status ?? null;
                return (
                  <MotionTableRow
                    {...rowMotion(index)}
                    key={item._id || item.name}
                    className={`text-center transition-colors duration-200 hover:bg-muted/50 ${isTabFetching ? "opacity-60" : ""}`}
                  >
                    <TableCell className="align-middle text-center p-4 text-muted-foreground tabular-nums">
                      {(page - 1) * limit + index + 1}
                    </TableCell>
                    <TableCell className="align-middle text-start ps-4">
                      <div className="flex items-center gap-3 min-w-0 max-w-[340px]">
                        <EntryAvatar name={item.name} imageUrl={item.imageUrl} className={accent.avatar} />
                        <div className="min-w-0">
                          <span title={item.name} className="block truncate text-sm font-semibold text-foreground">
                            {item.name}
                          </span>
                          {item.scientificName && (
                            <span title={item.scientificName} className="block truncate text-xs italic text-muted-foreground">
                              {item.scientificName}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <span
                        className={`inline-flex min-w-[28px] justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                          aliasCount ? "bg-muted text-foreground" : "text-muted-foreground/60"
                        }`}
                        title={`${aliasCount} alias${aliasCount === 1 ? "" : "es"}`}
                      >
                        {aliasCount}
                      </span>
                    </TableCell>
                    {showStatus && (
                      <TableCell className="align-middle">
                        {status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${
                            status.toLowerCase() === "banned"
                              ? "bg-red-50 text-red-600 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20"
                              : status.toLowerCase() === "restricted"
                                ? "bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:ring-yellow-500/20"
                                : "bg-muted text-muted-foreground ring-border"
                          }`}>
                            {status}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="align-middle">
                      <div className="mx-auto w-fit text-start"><AuditStamp at={item.createdAt} by={item.createdByName} /></div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="mx-auto w-fit text-start"><AuditStamp at={item.updatedAt} by={item.updatedByName} /></div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="flex items-center justify-center gap-0.5">
                        <CropAuditTrailModal crop={item} />
                        <button
                          type="button"
                          className={`p-1.5 rounded-md text-gray-400 dark:text-gray-500 transition-all ${accent.action}`}
                          onClick={() => setAliasManagerCrop(item)}
                          title="Manage aliases"
                          aria-label={`Manage aliases for ${item.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </MotionTableRow>
                );
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    );
  };

  const renderCropTable = (entries: ICropResponse[], nameLabel = "Crop Name") =>
    renderEntryTable(entries, nameLabel, false);
  const renderChemicalTable = (entries: ICropResponse[]) =>
    renderEntryTable(entries, "Chemical Name", true);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <MotionConfig reducedMotion="user">
      <ManagementShell
        isPage={isPage}
        open={open}
        onOpenChange={(val) => {
          if (!val) {
            resetAll();
            setAliasManagerCrop(null);
          }
          onOpenChange(val);
        }}
      >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <ShellHeader isPage={isPage}>
              <ShellTitle isPage={isPage}>
                <Cpu className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
                AgriTech Management
              </ShellTitle>
              <ShellDescription isPage={isPage}>
                Manage crop names &amp; aliases
              </ShellDescription>
            </ShellHeader>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsAuditOpen(true)}
                className="h-8 text-xs gap-1.5"
              >
                <History className="h-3.5 w-3.5" />
                View audit
              </Button>
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
              {isPage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    resetAll();
                    setAliasManagerCrop(null);
                    onOpenChange(false);
                  }}
                  className="h-8 text-xs gap-1.5 hover:border-rose-300 hover:text-rose-600 dark:hover:border-rose-500/40 dark:hover:text-rose-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Exit
                </Button>
              ) : (
              <button
                onClick={() => onOpenChange(false)}
                className="group h-8 w-8 flex items-center justify-center rounded-full bg-gray-50 dark:bg-[#1a1a1a] hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-gray-200 dark:border-gray-800 hover:border-rose-200 dark:hover:border-rose-800/30 text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 shadow-sm transition-all duration-300 focus:outline-none"
                title="Close"
              >
                <X className="h-4 w-4 transition-transform duration-300 group-hover:scale-110 group-active:scale-95" />
              </button>
              )}
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
              const underlineCls = isChem ? "bg-purple-500" : isCropTab ? "bg-amber-500" : "bg-blue-500";
              const activeCls = isChem
                ? "border-b-transparent text-purple-700 dark:text-purple-400 bg-purple-50/60 dark:bg-purple-500/5"
                : isCropTab
                  ? "border-b-transparent text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-500/5"
                  : "border-b-transparent text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-500/5";
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
                  {active && (
                    <motion.span
                      layoutId="agritech-tab-underline"
                      transition={tabUnderlineTransition}
                      className={`absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full ${underlineCls}`}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}

            {/* Organization tab */}
            <button
              id="agritech-tab-organization"
              onClick={() => handleTabSwitch("organization" as any)}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all duration-200 focus:outline-none whitespace-nowrap ${
                activeTab === "organization"
                  ? "border-b-transparent text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/5"
                  : "border-b-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <Building2 className={`h-3.5 w-3.5 ${activeTab === "organization" ? "text-emerald-600 dark:text-emerald-400" : ""}`} />
              Organization
              {activeTab === "organization" && (
                <motion.span
                  layoutId="agritech-tab-underline"
                  transition={tabUnderlineTransition}
                  className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-emerald-500"
                  aria-hidden
                />
              )}
            </button>

            {/* Rail fills remaining width */}
            <div className="flex-1 border-b-2 border-b-gray-100 dark:border-b-gray-800" />
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── Add Form ────────────────────────────────────────────────── */}
            <AnimatePresence initial={false}>
            {isAddFormOpen && activeTab !== "organization" && (
              <motion.div key="agritech-add-form" {...collapseMotion} className="overflow-hidden">
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

                {/* Image — optional, crop tab only (uploaded after the crop is created) */}
                {activeTab === "crop" && (
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                      Image
                      <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                        — optional
                      </span>
                    </label>
                    {newImagePreview ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={newImagePreview}
                          alt={newCropName || "New crop"}
                          className="h-16 w-16 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                        />
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-primary cursor-pointer hover:underline">
                            Replace
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handlePickNewImage(e.target.files?.[0] ?? null)}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handlePickNewImage(null)}
                            className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline text-left"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex h-16 items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePickNewImage(e.target.files?.[0] ?? null)}
                        />
                        Add crop image
                      </label>
                    )}
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
              </motion.div>
            )}

            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
            <motion.div key={activeTab} {...tabContentMotion}>
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
                <div className="mx-5 mt-4 px-4 pt-3 pb-2 border rounded-lg bg-card flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 w-full">
                    <div className="w-full max-w-xs sm:max-w-sm min-w-0">
                      <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="agritech-search"
                          aria-label={`Search ${entityNoun}`}
                          placeholder={`Search ${entityNoun} or aliases...`}
                          value={searchInput}
                          onChange={handleSearchChange}
                          className="pl-9 pr-9 bg-background text-sm"
                        />
                        {searchInput && (
                          <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Refresh"
                          onClick={() => void refetchTab()}
                          className="h-9 w-9 flex-shrink-0"
                        >
                          <RefreshCcw className={`h-4 w-4 text-muted-foreground ${isTabFetching ? "animate-spin text-primary" : ""}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Filters"
                          onClick={() => setIsFilterOpen(true)}
                          className="relative h-9 w-9 flex-shrink-0"
                        >
                          <Filter className="h-4 w-4" />
                          {activeFilterCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                              {activeFilterCount}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Filters</TooltipContent>
                    </Tooltip>
                    {!isChemical && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsSheetImportOpen(true)}
                        className="h-9 text-xs shrink-0"
                      >
                        <Upload className="h-4 w-4" />
                        <span className="hidden sm:inline">Import</span>
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {isTabLoading ? "Loading..." : `${tabData?.totalCount ?? items.length} ${entityNoun}`}
                      {searchQuery && !isTabLoading ? ` matching "${searchQuery}"` : ""}
                    </span>
                    {filterChips.map((chip) => (
                      <span
                        key={chip.key}
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                      >
                        {chip.label}
                        <button
                          type="button"
                          aria-label={`Remove ${chip.label}`}
                          onClick={() => updateFilters({ ...filterState, ...chip.reset })}
                          className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {filterChips.length > 1 && (
                      <button
                        type="button"
                        onClick={() => updateFilters(DEFAULT_AGRITECH_FILTERS)}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3">
                  {isTabLoading ? (
                    <TableSkeleton />
                  ) : items.length === 0 ? (
                    <div className="text-center py-14 rounded-xl border border-dashed border-gray-200 dark:border-gray-700/60">
                      {isChemical ? (
                        <FlaskConical className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      ) : activeTab === "crop" ? (
                        <Wheat className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      ) : (
                        <LayoutGrid className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      )}
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {searchQuery || activeFilterCount
                          ? `No ${entityNoun} match your search or filters`
                          : `No ${isChemical ? "chemicals" : activeTab === "crop" ? "crops" : labelOf(activeTab).toLowerCase()} added yet`}
                      </p>
                      {(searchQuery || activeFilterCount > 0) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-4 h-8 text-xs"
                          onClick={() => { updateFilters(DEFAULT_AGRITECH_FILTERS); setSearchInput(""); setSearchQuery(""); }}
                        >
                          Clear search and filters
                        </Button>
                      )}
                      {!searchQuery && !activeFilterCount && (
                        <div className="mt-4 flex justify-center gap-2">
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsAddFormOpen(true)}>
                            <Plus className="h-3.5 w-3.5" />
                            Add manually
                          </Button>
                          {!isChemical && (
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsSheetImportOpen(true)}>
                              <Upload className="h-3.5 w-3.5" />
                              Import sheet
                            </Button>
                          )}
                        </div>
                      )}
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
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-xl">
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
                  <AnimatePresence initial={false}>
                  {isAddFormOpen && (
                    <motion.div key="org-add-form" {...collapseMotion} className="overflow-hidden">
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
                    </motion.div>
                  )}
                  </AnimatePresence>

                  {isOrgLoading && !orgData ? (
                    <div className="mt-3"><TableSkeleton /></div>
                  ) : (
                  <div className="mt-3 rounded-lg bg-card border">
                    <ScrollArea className="w-full whitespace-nowrap">
                    <Table containerClassName="overflow-hidden" className="min-w-[800px] table-auto">
                      <TableHeader className="bg-card sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="w-16 text-center">Sl.No</TableHead>
                          <TableHead className="text-start ps-4">Organization</TableHead>
                          <TableHead className="text-center">Type</TableHead>
                          <TableHead className="text-center">State</TableHead>
                          <TableHead className="text-center">District</TableHead>
                          <TableHead className="text-center">Address</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                    {orgData?.organizations?.map((org: any, i: number) => (
                      <MotionTableRow {...rowMotion(i)} key={typeof org._id === 'object' ? org._id?.$oid : (org._id || org.id)} className="text-center transition-colors duration-200 hover:bg-muted/50">
                        <TableCell className="align-middle text-center p-4 text-muted-foreground tabular-nums">
                          {(orgPage - 1) * orgLimit + i + 1}
                        </TableCell>
                        <TableCell className="align-middle text-start ps-4">
                          <div className="flex items-center gap-3 min-w-0 max-w-[320px]">
                            <EntryAvatar name={org.org_name ?? ""} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" />
                            <span className="truncate text-sm font-semibold text-foreground" title={org.org_name}>{org.org_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="align-middle">
                          {org.type ? (
                            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground">{org.type}</span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle text-muted-foreground">{org.state || "—"}</TableCell>
                        <TableCell className="align-middle text-muted-foreground">{org.district || "—"}</TableCell>
                        <TableCell className="align-middle text-muted-foreground">
                          <span className="mx-auto block max-w-[260px] truncate" title={org.address}>{org.address || "—"}</span>
                        </TableCell>
                        <TableCell className="align-middle">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" aria-label={`Edit ${org.org_name}`} className="h-7 w-7 p-0 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10" onClick={() => {
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
                          <Button variant="ghost" size="sm" aria-label={`Delete ${org.org_name}`} className="h-7 w-7 p-0 text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10" onClick={() => setOrgToDelete(org)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        </TableCell>
                      </MotionTableRow>
                    ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                    {!isOrgLoading && orgData?.organizations?.length === 0 && (
                      <div className="text-center py-12 text-xs text-gray-500 dark:text-gray-400">
                        <Building2 className="h-7 w-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                        {orgSearchQuery ? `No organizations matching "${orgSearchQuery}"` : "No organizations added yet"}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </>
            )}
            </motion.div>
            </AnimatePresence>

          </div>

          {/* ── Pagination footer (same component as the All Questions list) ─ */}
          {activeTab !== "organization" && !isOther && totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 px-5 pb-3">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
                limit={limit}
                onLimitChange={(v) => { setLimit(v); setPage(1); }}
              />
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
          {activeTab === "organization" && (orgData?.totalPages ?? 0) > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 px-5 pb-3">
              <Pagination
                currentPage={orgPage}
                totalPages={orgData?.totalPages ?? 1}
                onPageChange={(p) => setOrgPage(p)}
                limit={orgLimit}
                onLimitChange={(v) => { setOrgLimit(v); setOrgPage(1); }}
              />
            </div>
          )}
      </ManagementShell>

      {/* ── Alias Manager Sub-Modal ─────────────────────────────────────────── */}
      {aliasManagerCrop && (
        <AliasManagerModal
          crop={aliasManagerCrop}
          allCropOptions={allCropOptions}
          onClose={() => setAliasManagerCrop(null)}
        />
      )}

      <AgriTechAuditModal open={isAuditOpen} onClose={() => setIsAuditOpen(false)} />

      <AgriTechFilterDrawer
        open={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        value={filterState}
        onChange={updateFilters}
        languages={INDIAN_LANGUAGES.map((lang) => lang.en)}
        states={(statesList ?? []).map((state) => state.stateNameEnglish)}
        showImage={filterScope.showImage}
        showStatus={filterScope.showStatus}
        entityLabel={entityNoun}
      />

      <CropSheetImportModal
        open={isSheetImportOpen}
        onClose={() => setIsSheetImportOpen(false)}
        entryType={activeTab}
      />

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
    </MotionConfig>
  );
};
