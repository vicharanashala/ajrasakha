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
import { Plus, Cpu, Wheat, Pencil, X, Loader2, Check, Languages, Trash2, Search, FlaskConical, LayoutGrid, Upload, Info, History, LogOut, Filter, RefreshCcw, ImageOff, Bug, Microscope, Sprout, Droplets, Flower2, ThermometerSun, ClipboardList, Mountain } from "lucide-react";
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

/** The older CSV bulk upload and its sample download are hidden in favour of the sheet
 *  Import; flip this to bring them back. */
const SHOW_LEGACY_CSV_UPLOAD = false;

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
      className="flex h-[calc(100dvh-9rem)] min-h-[560px] flex-col gap-3 overflow-hidden"
    >
      {children}
    </motion.section>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[80vw] sm:max-w-[80vw] max-w-[95vw] h-[80vh] p-3 flex flex-col overflow-hidden gap-3 bg-gray-50 dark:bg-[#0b0b0b]"
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
  tone = TONES.green,
  isChemical = false,
  isOther = false,
  editEntry = null,
  onUpdate,
  onCancelEdit,
}: {
  onAdd: (alias: ICropAliasObject) => void;
  /** Colour of the entry's type, so the form matches its tab. */
  tone?: TabTone;
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
  const isEditing = !!editEntry;

  // Prefill when entering edit mode; reset when it clears.
  useEffect(() => {
    setEntry(editEntry ? { ...editEntry } : emptyAliasEntry());
    setRegionInput("");
  }, [editEntry]);

  const addBtnClass = `${tone.button} text-white`;

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
            className="w-full h-14 px-2 py-1.5 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring"
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
            className="w-full h-14 px-2 py-1.5 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-ring"
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
  tone = TONES.green,
}: {
  aliases: ICropAliasObject[];
  onRemove: (index: number) => void;
  onEdit?: (index: number) => void;
  /** Row currently being edited (highlighted). */
  editingIndex?: number | null;
  /** Colour of the entry's type. */
  tone?: TabTone;
}) => {
  if (aliases.length === 0) return null;

  return (
    <ul className="rounded-xl border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-800/60 overflow-hidden">
      {aliases.map((alias, i) => {
        const details = [
          alias.page_number ? `p. ${alias.page_number}` : "",
          alias.agri_expert ? `Expert: ${alias.agri_expert}` : "",
          alias.remark || "",
        ].filter(Boolean);
        return (
          <li
            key={i}
            className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${
              editingIndex === i ? "bg-muted" : "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
            }`}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${tone.chip}`}>
                  {alias.language}
                </span>
                {alias.region && (
                  <span className="text-[11px] text-muted-foreground">{alias.region}</span>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <CropNamesCell value={alias.english_representation} className="font-medium text-foreground" />
                {alias.native_representation && (
                  <CropNamesCell value={alias.native_representation} className="text-muted-foreground" />
                )}
              </div>
              {(alias.source_link || details.length > 0) && (
                <p className="text-[11px] text-muted-foreground break-words">
                  {alias.source_link && (
                    <a href={alias.source_link} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                      Source
                    </a>
                  )}
                  {alias.source_link && details.length > 0 ? " · " : ""}
                  {details.join(" · ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  aria-label="Edit alias"
                  title="Edit alias"
                  className={`p-1.5 rounded-md transition-colors ${tone.action} ${
                    editingIndex === i ? tone.text : "text-gray-400"
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Delete alias"
                title="Delete alias"
                className="p-1.5 rounded-md transition-colors text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

// ── AliasManagerPanel ─────────────────────────────────────────────────────────
// Side panel for editing one entry's details and aliases, shown beside the list.
const AliasManagerPanel = ({
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
    <div className="flex h-full min-h-0 flex-col">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {(() => {
              const t = crop.type ?? "crop";
              const ModalIcon = iconOf(t);
              return (
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${accentOf(t).avatar}`}>
                  <ModalIcon className="h-4 w-4" />
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
            aria-label="Close details"
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
              tone={accentOf(crop.type ?? "crop")}
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
            tone={accentOf(crop.type ?? "crop")}
            isChemical={isChemicalEntry}
            editEntry={editingIndex !== null ? structuredAliases[editingIndex] : null}
            onUpdate={handleUpdateStructured}
            onCancelEdit={() => setEditingIndex(null)}
          />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50/50 dark:bg-white/[0.01]">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {structuredAliases.length + legacyAliases.length} total alias
            {structuredAliases.length + legacyAliases.length !== 1 ? "es" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setConfirmUpdateOpen(true)}
              disabled={isUpdating}
              className={`h-10 flex-1 gap-1.5 text-sm font-semibold text-white rounded-lg shadow-sm transition-colors ${accentOf(crop.type ?? "crop").button}`}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
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
    </div>
  );
};

// ── AliasSection (used in Add Crop form) ─────────────────────────────────────
const AliasSection = ({
  aliases,
  onAliasesChange,
  isChemical = false,
  isOther = false,
  tone = TONES.green,
}: {
  aliases: ICropAliasObject[];
  onAliasesChange: (next: ICropAliasObject[]) => void;
  isChemical?: boolean;
  isOther?: boolean;
  tone?: TabTone;
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
        tone={tone}
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
         tone={tone}
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

type TabTone = {
  avatar: string;
  action: string;
  text: string;
  bar: string;
  button: string;
  chip: string;
};

/** Full class strings per colour (kept literal so Tailwind can see them). */
const TONES = {
  green: {
    avatar: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    action: "hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10",
    text: "text-green-700 dark:text-green-300",
    bar: "bg-green-600 dark:bg-green-400",
    button: "bg-green-700 hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-500",
    chip: "border-green-300 bg-green-50 text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200",
  },
  violet: {
    avatar: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    action: "hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-300",
    bar: "bg-violet-600 dark:bg-violet-400",
    button: "bg-violet-700 hover:bg-violet-800 dark:bg-violet-600 dark:hover:bg-violet-500",
    chip: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200",
  },
  rose: {
    avatar: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    action: "hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-600 dark:bg-rose-400",
    button: "bg-rose-700 hover:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500",
    chip: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
  },
  orange: {
    avatar: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    action: "hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10",
    text: "text-orange-700 dark:text-orange-300",
    bar: "bg-orange-600 dark:bg-orange-400",
    button: "bg-orange-700 hover:bg-orange-800 dark:bg-orange-600 dark:hover:bg-orange-500",
    chip: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200",
  },
  lime: {
    avatar: "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300",
    action: "hover:text-lime-600 dark:hover:text-lime-400 hover:bg-lime-50 dark:hover:bg-lime-500/10",
    text: "text-lime-700 dark:text-lime-300",
    bar: "bg-lime-600 dark:bg-lime-400",
    button: "bg-lime-700 hover:bg-lime-800 dark:bg-lime-600 dark:hover:bg-lime-500",
    chip: "border-lime-300 bg-lime-50 text-lime-800 dark:border-lime-500/40 dark:bg-lime-500/10 dark:text-lime-200",
  },
  yellow: {
    avatar: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
    action: "hover:text-yellow-600 dark:hover:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-500/10",
    text: "text-yellow-700 dark:text-yellow-300",
    bar: "bg-yellow-600 dark:bg-yellow-400",
    button: "bg-yellow-700 hover:bg-yellow-800 dark:bg-yellow-600 dark:hover:bg-yellow-500",
    chip: "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-500/40 dark:bg-yellow-500/10 dark:text-yellow-200",
  },
  pink: {
    avatar: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
    action: "hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-500/10",
    text: "text-pink-700 dark:text-pink-300",
    bar: "bg-pink-600 dark:bg-pink-400",
    button: "bg-pink-700 hover:bg-pink-800 dark:bg-pink-600 dark:hover:bg-pink-500",
    chip: "border-pink-300 bg-pink-50 text-pink-800 dark:border-pink-500/40 dark:bg-pink-500/10 dark:text-pink-200",
  },
  red: {
    avatar: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    action: "hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10",
    text: "text-red-700 dark:text-red-300",
    bar: "bg-red-600 dark:bg-red-400",
    button: "bg-red-700 hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500",
    chip: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  },
  sky: {
    avatar: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    action: "hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10",
    text: "text-sky-700 dark:text-sky-300",
    bar: "bg-sky-600 dark:bg-sky-400",
    button: "bg-sky-700 hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500",
    chip: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  },
  amber: {
    avatar: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    action: "hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-600 dark:bg-amber-400",
    button: "bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500",
    chip: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  },
  teal: {
    avatar: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    action: "hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10",
    text: "text-teal-700 dark:text-teal-300",
    bar: "bg-teal-600 dark:bg-teal-400",
    button: "bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500",
    chip: "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-200",
  },
  cyan: {
    avatar: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    action: "hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-300",
    bar: "bg-cyan-600 dark:bg-cyan-400",
    button: "bg-cyan-700 hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-500",
    chip: "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200",
  },
  indigo: {
    avatar: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    action: "hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10",
    text: "text-indigo-700 dark:text-indigo-300",
    bar: "bg-indigo-600 dark:bg-indigo-400",
    button: "bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500",
    chip: "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200",
  },
  fuchsia: {
    avatar: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    action: "hover:text-fuchsia-600 dark:hover:text-fuchsia-400 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-500/10",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    bar: "bg-fuchsia-600 dark:bg-fuchsia-400",
    button: "bg-fuchsia-700 hover:bg-fuchsia-800 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-500",
    chip: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/40 dark:bg-fuchsia-500/10 dark:text-fuchsia-200",
  },
  emerald: {
    avatar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    action: "hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-600 dark:bg-emerald-400",
    button: "bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
  },
  slate: {
    avatar: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
    action: "hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-500/10",
    text: "text-slate-700 dark:text-slate-300",
    bar: "bg-slate-600 dark:bg-slate-400",
    button: "bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500",
    chip: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200",
  },
} satisfies Record<string, TabTone>;

type ToneName = keyof typeof TONES;

/**
 * Colour per AgriTech type, chosen to read naturally: crops green, chemicals violet,
 * pests rose, diseases orange, weeds lime, deficiencies yellow, flowers pink,
 * injuries red, practices sky, soil amber (earth) and organizations teal.
 */
const TYPE_TONES: Record<string, ToneName> = {
  crop: "green",
  chemical: "violet",
  pest: "rose",
  disease: "orange",
  weed: "lime",
  deficiency: "yellow",
  flower: "pink",
  injury: "red",
  practice: "sky",
  practices: "sky",
  soil: "amber",
  organization: "teal",
  other: "slate",
};

/** Colours handed to custom types, picked by name so a type always keeps its colour. */
const CUSTOM_TYPE_TONES: ToneName[] = ["cyan", "indigo", "fuchsia", "emerald"];

/** Colour accents for each kind of tab, so every element of a tab matches. */
const accentOf = (tab: string): TabTone => {
  const key = tab.trim().toLowerCase();
  const known = TYPE_TONES[key];
  if (known) return TONES[known];
  const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return TONES[CUSTOM_TYPE_TONES[hash % CUSTOM_TYPE_TONES.length]];
};

/** Icon per AgriTech type; custom types fall back to a generic grid. */
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crop: Wheat,
  chemical: FlaskConical,
  pest: Bug,
  disease: Microscope,
  weed: Sprout,
  deficiency: Droplets,
  flower: Flower2,
  injury: ThermometerSun,
  practice: ClipboardList,
  practices: ClipboardList,
  soil: Mountain,
  organization: Building2,
};

const iconOf = (tab: string) => TYPE_ICONS[tab.trim().toLowerCase()] ?? LayoutGrid;

/** Icon for each quick filter chip in the list toolbar. */
const QUICK_FILTER_ICONS: Record<string, React.ComponentType<{ className?: string }> | undefined> = {
  all: LayoutGrid,
  missing: Languages,
  noImage: ImageOff,
  recent: History,
};

/** One underlined tab in the header's type bar; the active one shows its entry count. */
const AgriTechTab = ({
  id,
  active,
  tone,
  icon: Icon,
  label,
  count,
  onClick,
}: {
  id: string;
  active: boolean;
  tone: ReturnType<typeof accentOf>;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  onClick: () => void;
}) => (
  <button
    id={id}
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`relative flex h-11 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
      active ? `font-semibold ${tone.text}` : "font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
    {count !== undefined && (
      <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${tone.avatar}`}>{count}</span>
    )}
    {active && (
      <motion.span
        layoutId="agritech-tab-underline"
        className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${tone.bar}`}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
      />
    )}
  </button>
);

/** Date and author of a create or update, stacked in one cell. */
const AuditStamp = ({ at, by }: { at?: string; by?: string }) => (
  <div className="min-w-0">
    <span className="block truncate text-xs text-gray-700 dark:text-gray-300" title={fmtAuditDate(at)}>
      {fmtAuditDate(at)}
    </span>
    {by?.trim() && (
      <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400" title={by.trim()}>
        by {by.trim()}
      </span>
    )}
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
  const [limit, setLimit] = useState(25);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orgSearchInput, setOrgSearchInput] = useState("");
  const [orgSearchQuery, setOrgSearchQuery] = useState("");
  const [orgPage, setOrgPage] = useState(1);
  const [orgLimit, setOrgLimit] = useState(25);
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

  // ── Summary tiles: unfiltered counts for the active entry tab ───────────────
  const isEntryTab = activeTab !== "organization" && !isOther;
  const weekAgoDay = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const { data: totalSummary } = useGetAllCrops({ type: activeTab, page: 1, limit: 1, enabled: isEntryTab });
  const { data: missingAliasSummary } = useGetAllCrops({
    type: activeTab, page: 1, limit: 1, filters: { aliases: "without" }, enabled: isEntryTab,
  });
  const { data: missingImageSummary } = useGetAllCrops({
    type: activeTab, page: 1, limit: 1, filters: { image: "without" }, enabled: isEntryTab && filterScope.showImage,
  });
  const { data: recentSummary } = useGetAllCrops({
    type: activeTab, page: 1, limit: 1,
    filters: toListFilters({ ...DEFAULT_AGRITECH_FILTERS, updatedFrom: weekAgoDay }, filterScope),
    enabled: isEntryTab,
  });
  const onlyFilter = (key: "aliases" | "image" | "updatedFrom") =>
    activeFilterCount === 1 &&
    (key === "aliases"
      ? filterState.aliases === "without"
      : key === "image"
        ? filterState.image === "without"
        : filterState.updatedFrom === weekAgoDay && !filterState.updatedTo);
  const summaryTiles = [
    {
      key: "all",
      label: `Total ${entityNoun}`,
      value: totalSummary?.totalCount,
      hint: "View all",
      hintCls: "text-muted-foreground",
      active: activeFilterCount === 0,
      apply: () => updateFilters({ ...DEFAULT_AGRITECH_FILTERS, sort: filterState.sort }),
    },
    {
      key: "missing",
      label: "Missing aliases",
      value: missingAliasSummary?.totalCount,
      hint: missingAliasSummary?.totalCount ? "Needs attention" : "All good",
      hintCls: missingAliasSummary?.totalCount ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400",
      active: onlyFilter("aliases"),
      apply: () => updateFilters({ ...DEFAULT_AGRITECH_FILTERS, sort: filterState.sort, aliases: "without" }),
    },
    // Only crops carry images, so this quick filter shows on the Crops tab alone.
    ...(filterScope.showImage
      ? [{
          key: "noImage",
          label: "Missing images",
          value: missingImageSummary?.totalCount,
          hint: missingImageSummary?.totalCount ? "Needs attention" : "All good",
          hintCls: missingImageSummary?.totalCount ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400",
          active: onlyFilter("image"),
          apply: () => updateFilters({ ...DEFAULT_AGRITECH_FILTERS, sort: filterState.sort, image: "without" as const }),
        }]
      : []),
    {
      key: "recent",
      label: "Updated this week",
      value: recentSummary?.totalCount,
      hint: "Review",
      hintCls: "text-muted-foreground",
      active: onlyFilter("updatedFrom"),
      apply: () => updateFilters({ ...DEFAULT_AGRITECH_FILTERS, sort: filterState.sort, updatedFrom: weekAgoDay }),
    },
  ];
  const tone = accentOf(activeTab);
  const singularNoun =
    activeTab === "crop" ? "crop" : isChemical ? "chemical" : isOther ? "type" : activeTab === "organization" ? "organization" : labelOf(activeTab).toLowerCase();

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
    setSearchInput(""); setSearchQuery(""); setPage(1); setLimit(25);
  };

  const handleTabSwitch = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsAddFormOpen(false);
    setAliasManagerCrop(null);
    setNewCropName("");
    setNewAliases([]);
    setChemicalStatus("");
    setNewChemicalCrops([]);
    setNewScientificName("");
    setCustomType("");
    setSearchInput(""); setSearchQuery(""); setPage(1);
  };

  const isSaving = isCreating || isUpdatingImage;
  const openEntry = (item: ICropResponse) => {
    setIsAddFormOpen(false);
    setAliasManagerCrop(item);
  };
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
      <div>
          <Table containerClassName="overflow-visible" className="min-w-[900px] table-auto">
            <TableHeader className="bg-gray-50/95 dark:bg-[#151515]/95 backdrop-blur sticky top-0 z-10 shadow-[0_1px_0_0_rgb(0_0_0/0.06)] [&_th]:h-10 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted-foreground">
              <TableRow>
                <TableHead className="text-start ps-4">
                  <SortHeader label={nameLabel} asc="name_asc" desc="name_desc" sort={filterState.sort} onSort={onSort} align="start" />
                </TableHead>
                {showStatus && <TableHead className="text-center">Status</TableHead>}
                <TableHead className="text-start">Aliases</TableHead>
                <TableHead className="text-start">
                  <SortHeader label="Last updated" asc="updated_asc" desc="updated_desc" sort={filterState.sort} onSort={onSort} align="start" />
                </TableHead>
                <TableHead className="text-end pe-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((item, index) => {
                const aliasNames = (item.aliases || [])
                  .map((a) => (typeof a === "string" ? a : a.english_representation || a.native_representation))
                  .filter(Boolean);
                const status = item.status ?? null;
                const isSelected =
                  !!aliasManagerCrop && (aliasManagerCrop._id ?? aliasManagerCrop.name) === (item._id ?? item.name);
                return (
                  <MotionTableRow
                    {...rowMotion(index)}
                    key={item._id || item.name}
                    onClick={() => openEntry(item)}
                    aria-selected={isSelected}
                    className={`text-center cursor-pointer transition-colors duration-200 ${
                      isSelected ? "bg-muted" : "hover:bg-muted/50"
                    } ${isTabFetching ? "opacity-60" : ""}`}
                  >
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
                    <TableCell className="align-middle text-start">
                      <div className="flex flex-wrap gap-1 max-w-[320px] whitespace-normal">
                        {aliasNames.length === 0 ? (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                            No aliases yet
                          </span>
                        ) : (
                          <>
                            {aliasNames.slice(0, 3).map((name, i) => (
                              <span
                                key={`${name}-${i}`}
                                title={name}
                                className="inline-block max-w-[120px] truncate rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
                              >
                                {name}
                              </span>
                            ))}
                            {aliasNames.length > 3 && (
                              <button
                                type="button"
                                onClick={() => openEntry(item)}
                                title={aliasNames.slice(3).join(", ")}
                                className="inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                +{aliasNames.length - 3}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="text-start"><AuditStamp at={item.updatedAt} by={item.updatedByName} /></div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <div className="flex items-center justify-end gap-0.5 pe-2" onClick={(e) => e.stopPropagation()}>
                        <CropAuditTrailModal crop={item} />
                        <button
                          type="button"
                          className={`p-1.5 rounded-md text-gray-400 dark:text-gray-500 transition-all ${accent.action}`}
                          onClick={() => openEntry(item)}
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
          {/* ── Header section (title, page actions, type tabs) ─────────────── */}
          <header className="flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 pt-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-600/20" aria-hidden>
                  <Cpu className="h-5 w-5 text-white" />
                </span>
                <ShellHeader isPage={isPage}>
                  <ShellTitle isPage={isPage}>AgriTech Management</ShellTitle>
                  <ShellDescription isPage={isPage}>
                    Crops, chemicals, custom types and organizations used to tag farmer questions
                  </ShellDescription>
                </ShellHeader>
              </div>

              {/* Page actions: secondary on the left, the primary action last before Exit */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsAuditOpen(true)}
                  className="h-9 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <History className="h-4 w-4" />
                  Audit trail
                </Button>
                {activeTab === "organization" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setIsKvkImportOpen(true)} className="h-9 text-xs gap-1.5">
                      <Building2 className="h-4 w-4" />
                      Fetch KVKs
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsOrgImportOpen(true)} className="h-9 text-xs gap-1.5">
                      <Upload className="h-4 w-4" />
                      Import
                    </Button>
                  </>
                ) : (
                  !isChemical && !isOther && (
                    <Button variant="outline" size="sm" onClick={() => setIsSheetImportOpen(true)} className="h-9 text-xs gap-1.5">
                      <Upload className="h-4 w-4" />
                      Import
                    </Button>
                  )
                )}
                <Button
                  type="button"
                  size="sm"
                  className={`h-9 text-xs gap-1.5 shadow-sm text-white transition-colors ${tone.button}`}
                  onClick={() => {
                    setAliasManagerCrop(null);
                    setIsAddFormOpen(!isAddFormOpen);
                  }}
                >
                  <Plus className={`h-4 w-4 transition-transform duration-200 ${isAddFormOpen ? "rotate-45" : ""}`} />
                  {isAddFormOpen ? "Cancel" : isOther ? "New type" : `Add ${singularNoun}`}
                </Button>
                <span className="mx-1 hidden h-6 w-px bg-gray-200 dark:bg-gray-800 sm:block" aria-hidden />
                {isPage ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      resetAll();
                      setAliasManagerCrop(null);
                      onOpenChange(false);
                    }}
                    className="h-9 text-xs gap-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                  >
                    <LogOut className="h-4 w-4" />
                    Exit
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Tab bar: one underlined tab per entry type; Organizations set apart on the right */}
            <div className="mt-3 flex items-end gap-2 px-3">
              <div
                role="tablist"
                aria-label="Entry type"
                className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {tabs.map((tab) => {
                  const active = activeTab === tab;
                  if (tab === "other") {
                    return (
                      <button
                        key={tab}
                        id="agritech-tab-other"
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleTabSwitch(tab)}
                        className={`mb-1.5 ml-1 flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-dashed px-3 text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active
                            ? TONES.slate.chip
                            : "border-gray-300 dark:border-gray-700 text-muted-foreground hover:text-foreground hover:border-gray-400"
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        New type
                      </button>
                    );
                  }
                  const isChem = tab === "chemical";
                  const isCropTab = tab === "crop";
                  const Icon = iconOf(tab);
                  const label = isChem ? "Chemicals" : isCropTab ? "Crops" : labelOf(tab);
                  return (
                    <AgriTechTab
                      key={tab}
                      id={`agritech-tab-${tab}`}
                      active={active}
                      tone={accentOf(tab)}
                      icon={Icon}
                      label={label}
                      count={active ? totalSummary?.totalCount : undefined}
                      onClick={() => handleTabSwitch(tab)}
                    />
                  );
                })}
              </div>
              <span className="mb-3 h-5 w-px flex-shrink-0 bg-gray-200 dark:bg-gray-800" aria-hidden />
              <div role="tablist" aria-label="Directory" className="flex flex-shrink-0 items-end">
                <AgriTechTab
                  id="agritech-tab-organization"
                  active={activeTab === "organization"}
                  tone={accentOf("organization")}
                  icon={Building2}
                  label="Organizations"
                  onClick={() => handleTabSwitch("organization" as any)}
                />
              </div>
            </div>
          </header>

          {/* Body: list on the left, detail / add panel on the right */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] shadow-sm flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Toolbar: search, quick filters and filters for the list below */}
          {!isOther && (
            <div className="flex-shrink-0 space-y-2.5 border-b border-gray-100 dark:border-gray-800 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  {activeTab === "organization" ? (
                    <Input
                      aria-label="Search organizations"
                      placeholder="Search organizations..."
                      value={orgSearchInput}
                      onChange={handleOrgSearchChange}
                      className="h-9 pl-9 pr-9 bg-gray-50 dark:bg-white/[0.03] text-sm"
                    />
                  ) : (
                    <Input
                      id="agritech-search"
                      aria-label={`Search ${entityNoun}`}
                      placeholder={`Search ${entityNoun} or aliases...`}
                      value={searchInput}
                      onChange={handleSearchChange}
                      className="h-9 pl-9 pr-9 bg-gray-50 dark:bg-white/[0.03] text-sm"
                    />
                  )}
                  {activeTab !== "organization" && searchInput ? (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => { setSearchInput(""); setSearchQuery(""); setPage(1); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (activeTab === "organization" ? isOrgLoading : isTabFetching && !isTabLoading) ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                </div>

                {activeTab !== "organization" && (
                  <>
                    {/* Quick filters with live counts, as chips beside the search box */}
                    <div role="group" aria-label="Quick filters" className="flex flex-wrap items-center gap-1.5">
                      {summaryTiles.map((tile) => {
                        const TileIcon = QUICK_FILTER_ICONS[tile.key];
                        const warn = tile.key !== "all" && tile.key !== "recent" && !!tile.value;
                        return (
                          <button
                            key={tile.key}
                            type="button"
                            aria-pressed={tile.active}
                            onClick={tile.apply}
                            className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                              tile.active
                                ? `${tone.chip} font-semibold`
                                : "border-gray-200 dark:border-gray-700 bg-background text-gray-700 dark:text-gray-300 hover:bg-muted"
                            }`}
                          >
                            {TileIcon && <TileIcon className="h-3.5 w-3.5" />}
                            {tile.key === "all" ? "All" : tile.label}
                            <span
                              className={`rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${
                                tile.active
                                  ? "bg-white/70 dark:bg-black/20"
                                  : warn
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                    : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
                              }`}
                            >
                              {tile.value ?? "–"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Sort and filter"
                      onClick={() => setIsFilterOpen(true)}
                      className="h-9 text-xs gap-1.5"
                    >
                      <Filter className="h-4 w-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${tone.button}`}>
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>

                    <div className="ml-auto flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Refresh"
                            onClick={() => void refetchTab()}
                            className="h-9 w-9"
                          >
                            <RefreshCcw className={`h-4 w-4 text-muted-foreground ${isTabFetching ? "animate-spin text-primary" : ""}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                      </Tooltip>
                    </div>
                  </>
                )}
              </div>

              {activeTab !== "organization" && filterChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
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
              )}
            </div>
          )}


            <AnimatePresence mode="wait" initial={false}>
            <motion.div key={activeTab} {...tabContentMotion} className="flex flex-1 min-h-0 flex-col overflow-y-auto">
            {/* ── Active-tab content ─────────────────────────────────────────── */}
            {activeTab !== "organization" && (isOther ? (
              /* "Other" is where a NEW custom type is created; each type then gets its own tab. */
              <div className="px-5 py-12 text-center">
                <LayoutGrid className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Add a new type here
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
                  Use “New type” to name a new type and add its data.
                  Each type you add appears as its own tab beside Crops.
                </p>
              </div>
            ) : (
              <>
                {/* Only the list scrolls; it fills whatever height is left */}
                <div className="flex-1 min-h-0 overflow-auto">
                  {isTabLoading ? (
                    <TableSkeleton />
                  ) : items.length === 0 ? (
                    <div className="text-center py-14">
                      {(() => {
                        const EmptyIcon = iconOf(activeTab);
                        return (
                          <span className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${tone.avatar}`} aria-hidden>
                            <EmptyIcon className="h-6 w-6" />
                          </span>
                        );
                      })()}
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
                  <AnimatePresence initial={false}>
                  {isAddFormOpen && (
                    <motion.div key="org-add-form" {...collapseMotion} className="overflow-hidden">
                    <div className="mt-4 mb-3 p-4 rounded-xl border-l-[3px] border-l-teal-500 border border-teal-200/60 dark:border-teal-500/15 bg-teal-50/30 dark:bg-teal-500/[0.03]">
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
                        
                        <div className="flex items-center gap-2 mt-2">
                          <Button variant="outline" onClick={() => { setIsAddFormOpen(false); setOrgEditId(null); setOrgName(""); setOrgType(""); setOrgState(""); setOrgDistrict(""); setOrgAddress(""); }} className="h-10 px-5 text-sm">Cancel</Button>
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
                          }} className={`h-10 flex-1 text-sm font-semibold text-white shadow-sm transition-colors ${TONES.teal.button}`}>{orgEditId ? "Update Organization" : "Add Organization"}</Button>
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
                            <EntryAvatar name={org.org_name ?? ""} className={TONES.teal.avatar} />
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
                          <Button variant="ghost" size="sm" aria-label={`Edit ${org.org_name}`} className="h-7 w-7 p-0 text-gray-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:text-teal-400 dark:hover:bg-teal-500/10" onClick={() => {
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

          {/* ── Pagination footer (same component as the All Questions list) ─ */}
          {activeTab !== "organization" && !isOther && totalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 px-4 pb-2">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => setPage(p)}
                limit={limit}
                onLimitChange={(v) => { setLimit(v); setPage(1); }}
              />
            </div>
          )}
          {/* Organizations pagination */}
          {activeTab === "organization" && (orgData?.totalPages ?? 0) > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 px-4 pb-2">
              <Pagination
                currentPage={orgPage}
                totalPages={orgData?.totalPages ?? 1}
                onPageChange={(p) => setOrgPage(p)}
                limit={orgLimit}
                onLimitChange={(v) => { setOrgLimit(v); setOrgPage(1); }}
              />
            </div>
          )}
          </div>

          {/* ── Side panel: entry details or the add form ─────────────────── */}
          <AnimatePresence initial={false}>
            {(aliasManagerCrop || (isAddFormOpen && activeTab !== "organization")) && (
              <motion.aside
                key="agritech-side-panel"
                aria-label={aliasManagerCrop ? `${aliasManagerCrop.name} details` : "Add entry"}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="fixed inset-0 z-50 flex flex-col bg-background lg:static lg:z-auto lg:w-[min(560px,45%)] lg:flex-shrink-0 lg:border-l lg:border-gray-100 lg:dark:border-gray-800"
              >
                {aliasManagerCrop ? (
                  <AliasManagerPanel
                    key={aliasManagerCrop._id || aliasManagerCrop.name}
                    crop={aliasManagerCrop}
                    allCropOptions={allCropOptions}
                    onClose={() => setAliasManagerCrop(null)}
                  />
                ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                    {isOther ? "New type" : `Add ${singularNoun}`}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Add one entry here, or bulk-upload a CSV.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  aria-label="Close add form"
                  className="h-8 w-8 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-800 text-gray-500 hover:text-rose-600 hover:border-rose-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

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
                    tone={tone}
                  />
                </div>

                {/* Hint: on the Other tab, a type name is required before adding/uploading */}
                {isOther && !customType.trim() && (
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <Info className="h-3.5 w-3.5 flex-shrink-0" />
                    Enter a type name above to enable adding.
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {SHOW_LEGACY_CSV_UPLOAD ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBulkUploading || isProcessingBulk || (isOther && !customType.trim())}
                      title={isOther && !customType.trim() ? "Enter a type name first" : undefined}
                      className={`h-8 text-xs gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${tone.chip}`}
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
                  ) : null}
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
                    className={`text-white rounded-lg shadow-sm transition-colors ${
                      SHOW_LEGACY_CSV_UPLOAD ? "h-8 text-xs" : "h-10 w-full text-sm font-semibold"
                    } ${tone.button}`}
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
            </div>
                )}
              </motion.aside>
            )}
          </AnimatePresence>
          </div>

          
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
      </ManagementShell>

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
