import { useState, useCallback, useRef } from "react";
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
import { Plus, Cpu, Wheat, Pencil, X, Loader2, Check, Languages, Trash2, Search, FlaskConical, LayoutGrid, Upload } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { toast } from "sonner";
import { useCreateCrop } from "@/hooks/api/crop/useCreateCrop";
import { useUpdateCrop } from "@/hooks/api/crop/useUpdateCrop";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import { useBulkUploadCrops } from "@/hooks/api/crop/useBulkUploadCrops";
import type { ICropAlias, ICropResponse } from "@/hooks/services/cropService";
import { CropMultiSelect } from "@/components/atoms/CropMultiSelect";

type EntryType = "crop" | "chemical" | "other";

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
}: {
  onAdd: (alias: ICropAliasObject) => void;
  accentColor?: "amber" | "blue";
  isChemical?: boolean;
  isOther?: boolean;
}) => {
  const [entry, setEntry] = useState<ICropAliasObject>(emptyAliasEntry());
  const [regionInput, setRegionInput] = useState("");
  const isAmber = accentColor === "amber";

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
    onAdd({ ...entry });
    setEntry(emptyAliasEntry());
    setRegionInput("");
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-[#141414] p-4 space-y-3">
      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        {isChemical ? "Add New Trade Name" : "Add New Alias"}
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

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={!canAdd}
          className={`h-7 text-[11px] gap-1 px-3 rounded-md disabled:opacity-40 ${addBtnClass}`}
        >
          <Plus className="h-3 w-3" />
          {isChemical ? "Add Trade Name" : "Add Alias"}
        </Button>
      </div>
    </div>
  );
};
// CREATE COMMON COMPONENT

const StructuredAliasesTable = ({
  aliases,
  onRemove,
}: {
  aliases: ICropAliasObject[];
  onRemove: (index: number) => void;
}) => {
  if (aliases.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_32px] gap-0 bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
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
          className={`grid grid-cols-[1fr_1fr_1fr_1fr_32px] gap-0 items-center group transition-colors
            ${
              i < aliases.length - 1
                ? "border-b border-gray-100 dark:border-gray-800/60"
                : ""
            }
            hover:bg-gray-50/60 dark:hover:bg-white/[0.02]`}
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
            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate block">
              {alias.english_representation}
            </span>
          </div>

          <div className="px-3 py-2.5 min-w-0">
            <span className="text-xs text-gray-600 dark:text-gray-400 truncate block">
              {alias.native_representation}
            </span>
          </div>

          <div className="flex items-center justify-center pr-1">
            <button
              type="button"
              onClick={() => onRemove(i)}
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

  const { mutateAsync: updateCrop, isPending: isUpdating } = useUpdateCrop();

  const totalCount = legacyAliases.length + structuredAliases.length;

  const handleAdd = (alias: ICropAliasObject) => {
    setStructuredAliases((prev) => [...prev, alias]);
  };

  const handleRemoveStructured = (index: number) => {
    setStructuredAliases((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveLegacy = (alias: string) => {
    setLegacyAliases((prev) => prev.filter((a) => a !== alias));
  };

  const handleSave = async () => {
    if (!crop._id) return;
    if (!window.confirm(`Update "${crop.name}"?`)) return;
    try {
      const payload: { aliases: (ICropAliasObject | string)[]; status?: string; crops?: string[] } = {
        aliases: [...legacyAliases, ...structuredAliases],
      };
      if (isChemicalEntry) {
        payload.status = chemicalStatus;
        payload.crops = chemicalCrops;
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
        className="sm:max-w-[560px] max-w-[95vw] h-[82vh] p-0 flex flex-col overflow-hidden gap-0"
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
              <h2 className="text-sm font-bold text-gray-900 dark:text-white capitalize leading-tight">
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
                        <span className="capitalize">{cropName}</span>
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

          {/* ── Add Alias Form ────────────────────────────────────────── */}
          <AliasEntryForm onAdd={handleAdd} accentColor="amber" isChemical={isChemicalEntry} />
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
              onClick={handleSave}
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
  const handleAdd = (alias: ICropAliasObject) => {
    onAliasesChange([...aliases, alias]);
  };

  const handleRemove = (i: number) => {
    onAliasesChange(aliases.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <AliasEntryForm onAdd={handleAdd} accentColor="amber" isChemical={isChemical} isOther={isOther} />
      {aliases.length > 0 && (
         <StructuredAliasesTable
         aliases={aliases}
         onRemove={handleRemove}
       />
      )}
    </div>
  );
};

// -- Main Modal ----------------------------------------------------------------
type ActiveTab = "crop" | "chemical" | "other";

export const CropManagementModal = ({
  open,
  onOpenChange,
}: CropManagementModalProps) => {
  // ── Add-form state ──────────────────────────────────────────────────────────
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [entryType, setEntryType] = useState<EntryType>("crop");
  const [newCropName, setNewCropName] = useState("");
  const [newAliases, setNewAliases] = useState<ICropAliasObject[]>([]);
  const [chemicalStatus, setChemicalStatus] = useState("");
  const [newChemicalCrops, setNewChemicalCrops] = useState<string[]>([]);
  const [otherType, setOtherType] = useState("");
  const [aliasManagerCrop, setAliasManagerCrop] = useState<ICropResponse | null>(null);

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("crop");

  // ── Per-tab search / pagination ─────────────────────────────────────────────
  const [cropSearchInput, setCropSearchInput] = useState("");
  const [cropSearchQuery, setCropSearchQuery] = useState("");
  const [cropPage, setCropPage] = useState(1);

  const [chemSearchInput, setChemSearchInput] = useState("");
  const [chemSearchQuery, setChemSearchQuery] = useState("");
  const [chemPage, setChemPage] = useState(1);

  const [otherSearchInput, setOtherSearchInput] = useState("");
  const [otherSearchQuery, setOtherSearchQuery] = useState("");
  const [otherPage, setOtherPage] = useState(1);

  const cropDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chemDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cropLimit, setCropLimit] = useState(12);
  const [chemLimit, setChemLimit] = useState(12);
  const [otherLimit, setOtherLimit] = useState(12);

  const handleCropSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCropSearchInput(value);
    if (cropDebounce.current) clearTimeout(cropDebounce.current);
    cropDebounce.current = setTimeout(() => { setCropSearchQuery(value); setCropPage(1); }, 350);
  }, []);

  const handleChemSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setChemSearchInput(value);
    if (chemDebounce.current) clearTimeout(chemDebounce.current);
    chemDebounce.current = setTimeout(() => { setChemSearchQuery(value); setChemPage(1); }, 350);
  }, []);

  const handleOtherSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOtherSearchInput(value);
    if (otherDebounce.current) clearTimeout(otherDebounce.current);
    otherDebounce.current = setTimeout(() => { setOtherSearchQuery(value); setOtherPage(1); }, 350);
  }, []);

  // ── API calls ───────────────────────────────────────────────────────────────
  const { mutateAsync: createCrop, isPending: isCreating } = useCreateCrop();
  const { mutateAsync: bulkUploadCrops, isPending: isBulkUploading } = useBulkUploadCrops();

  const { data: cropTabData, isLoading: isCropTabLoading, isFetching: isCropTabFetching } = useGetAllCrops({
    search: cropSearchQuery,
    page: cropPage,
    limit: cropLimit,
    type: "crop",
  });

  const { data: chemTabData, isLoading: isChemTabLoading, isFetching: isChemTabFetching } = useGetAllCrops({
    search: chemSearchQuery,
    page: chemPage,
    limit: chemLimit,
    type: "chemical",
  });

  const { data: allCropOptionsData } = useGetAllCrops({
    type: "crop",
    page: 1,
    limit: 500,
  });

  const { data: otherTabData, isLoading: isOtherTabLoading, isFetching: isOtherTabFetching } = useGetAllCrops({
    search: otherSearchQuery,
    page: otherPage,
    limit: otherLimit,
    type: "other",
  });

  const cropItems: ICropResponse[] = cropTabData?.crops || [];
  const cropTotalPages = cropTabData?.totalPages ?? 1;
  const chemItems: ICropResponse[] = chemTabData?.crops || [];
  const chemTotalPages = chemTabData?.totalPages ?? 1;
  const otherItems: ICropResponse[] = otherTabData?.crops || [];
  const otherTotalPages = otherTabData?.totalPages ?? 1;
  const allCropOptions: ICropResponse[] = allCropOptionsData?.crops || cropItems;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const resetAddForm = () => {
    setNewCropName("");
    setNewAliases([]);
    setChemicalStatus("");
    setNewChemicalCrops([]);
    setOtherType("");
    setEntryType(activeTab);
    setIsAddFormOpen(false);
  };

  const resetAll = () => {
    resetAddForm();
    setActiveTab("crop");
    setCropSearchInput(""); setCropSearchQuery(""); setCropPage(1); setCropLimit(12);
    setChemSearchInput(""); setChemSearchQuery(""); setChemPage(1); setChemLimit(12);
    setOtherSearchInput(""); setOtherSearchQuery(""); setOtherPage(1); setOtherLimit(12);
  };

  const handleTabSwitch = (tab: ActiveTab) => {
    setActiveTab(tab);
    setEntryType(tab === "other" ? "other" : tab);
    setIsAddFormOpen(false);
    setNewCropName("");
    setNewAliases([]);
    setChemicalStatus("");
    setNewChemicalCrops([]);
    setOtherType("");
  };

  const isSaving = isCreating;

  const handleSave = async () => {
    const name = newCropName.trim();
    if (!name) return;
    if (!window.confirm(`Are you sure you want to create "${name}"?`)) return;
    try {
      const res = await createCrop({
        name,
        type: entryType === "other" && otherType.trim() ? otherType.trim() : entryType,
        ...(entryType === "chemical" ? { status: chemicalStatus, crops: newChemicalCrops } : {}),
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error("Please upload a CSV file");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (entryType !== "crop" && entryType !== "chemical") {
      toast.error("Bulk upload is only supported for crop and chemical types");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    try {
      const res = await bulkUploadCrops({ file, type: entryType as "crop" | "chemical" });
      if (res?.success) {
        toast.success(`${res.count} rows are being processed in the background. The list will refresh shortly.`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload CSV");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Table renderer for crops ────────────────────────────────────────────────
  const renderCropTable = (items: ICropResponse[]) => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[48px_1fr_96px_80px] bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
        {["Sl No", "Crop Name", "Aliases Count", "Manage Aliases"].map((h, i) => (
          <div
            key={i}
            className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 2 || i === 3 ? "text-center" : ""}`}
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
            className={`grid grid-cols-[48px_1fr_96px_80px] items-center group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] ${
              index < items.length - 1 ? "border-b border-gray-100 dark:border-gray-800/60" : ""
            }`}
          >
            {/* Sl No */}
            <div className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
              {index + 1}
            </div>
            {/* Crop Name */}
            <div className="px-3 py-2.5 min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize truncate block">
                {item.name}
              </span>
            </div>
            {/* Aliases Count */}
            <div className="px-3 py-2.5 text-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {aliasCount}
              </span>
            </div>
            {/* Manage Aliases */}
            <div className="px-3 py-2.5 flex items-center justify-center">
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
      <div className="grid grid-cols-[48px_1fr_96px_100px_80px] bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
        {["Sl No", "Chemical Name", "Aliases Count", "Status", "Manage Aliases"].map((h, i) => (
          <div
            key={i}
            className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 2 || i === 4 ? "text-center" : ""}`}
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
            className={`grid grid-cols-[48px_1fr_96px_100px_80px] items-center group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] ${
              index < items.length - 1 ? "border-b border-gray-100 dark:border-gray-800/60" : ""
            }`}
          >
            {/* Sl No */}
            <div className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
              {index + 1}
            </div>
            {/* Chemical Name */}
            <div className="px-3 py-2.5 min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize truncate block">
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
            {/* Manage Aliases */}
            <div className="px-3 py-2.5 flex items-center justify-center">
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

  // ── Table renderer for other entries ───────────────────────────────────────
  const renderOtherTable = (items: ICropResponse[]) => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[48px_1fr_100px_96px_80px] bg-gray-50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-gray-700/60">
        {["Sl No", "Name", "Sub-Type", "Aliases Count", "Manage Aliases"].map((h, i) => (
          <div
            key={i}
            className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider ${i === 3 || i === 4 ? "text-center" : ""}`}
          >
            {h}
          </div>
        ))}
      </div>
      {/* Rows */}
      {items.map((item, index) => {
        const id = item._id || item.name;
        const aliasCount = (item.aliases || []).length;
        const subType = item.type && item.type !== "other" ? item.type : "Other";
        return (
          <div
            key={id}
            className={`grid grid-cols-[48px_1fr_100px_96px_80px] items-center group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03] ${
              index < items.length - 1 ? "border-b border-gray-100 dark:border-gray-800/60" : ""
            }`}
          >
            {/* Sl No */}
            <div className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 font-medium">
              {index + 1}
            </div>
            {/* Name */}
            <div className="px-3 py-2.5 min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize truncate block">
                {item.name}
              </span>
            </div>
            {/* Sub-Type */}
            <div className="px-3 py-2.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border leading-tight bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20 capitalize">
                {subType}
              </span>
            </div>
            {/* Aliases Count */}
            <div className="px-3 py-2.5 text-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {aliasCount}
              </span>
            </div>
            {/* Manage Aliases */}
            <div className="px-3 py-2.5 flex items-center justify-center">
              <button
                className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
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
          className="sm:max-w-[540px] max-w-[95vw] h-[80vh] p-0 flex flex-col overflow-hidden gap-0"
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
                size="sm"
                className={`h-8 text-xs gap-1.5 shadow-sm text-white transition-colors ${
                  activeTab === "chemical"
                    ? "bg-purple-600 hover:bg-purple-700"
                    : activeTab === "other"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
                onClick={() => {
                  setEntryType(activeTab === "other" ? "other" : activeTab);
                  setIsAddFormOpen(!isAddFormOpen);
                }}
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

          {/* Tab Bar */}
          <div className="flex items-end gap-0 px-5 pt-3 pb-0 flex-shrink-0">
            {/* Crops tab */}
            <button
              id="agritech-tab-crop"
              onClick={() => handleTabSwitch("crop")}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all duration-200 focus:outline-none ${
                activeTab === "crop"
                  ? "border-b-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-500/5"
                  : "border-b-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <Wheat className={`h-3.5 w-3.5 ${activeTab === "crop" ? "text-amber-600 dark:text-amber-400" : ""}`} />
              Crops
            </button>

            {/* Chemicals tab */}
            <button
              id="agritech-tab-chemical"
              onClick={() => handleTabSwitch("chemical")}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all duration-200 focus:outline-none ${
                activeTab === "chemical"
                  ? "border-b-purple-500 text-purple-700 dark:text-purple-400 bg-purple-50/60 dark:bg-purple-500/5"
                  : "border-b-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <FlaskConical className={`h-3.5 w-3.5 ${activeTab === "chemical" ? "text-purple-600 dark:text-purple-400" : ""}`} />
              Chemicals
            </button>

            {/* Other tab */}
            <button
              id="agritech-tab-other"
              onClick={() => handleTabSwitch("other")}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all duration-200 focus:outline-none ${
                activeTab === "other"
                  ? "border-b-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50/60 dark:bg-blue-500/5"
                  : "border-b-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <LayoutGrid className={`h-3.5 w-3.5 ${activeTab === "other" ? "text-blue-600 dark:text-blue-400" : ""}`} />
              Other
            </button>

            {/* Rail fills remaining width */}
            <div className="flex-1 border-b-2 border-b-gray-100 dark:border-b-gray-800" />
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── Add Form ────────────────────────────────────────────────── */}
            {isAddFormOpen && (
              <div className={`mx-5 mt-4 mb-3 p-4 rounded-xl border-l-[3px] space-y-3 ${
                activeTab === "chemical"
                  ? "border-l-purple-500 border border-purple-200/60 dark:border-purple-500/15 bg-purple-50/30 dark:bg-purple-500/[0.03]"
                  : activeTab === "other"
                  ? "border-l-blue-500 border border-blue-200/60 dark:border-blue-500/15 bg-blue-50/30 dark:bg-blue-500/[0.03]"
                  : "border-l-amber-500 border border-amber-200/60 dark:border-amber-500/15 bg-amber-50/30 dark:bg-amber-500/[0.03]"
              }`}>

                {/* Type selector */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Type
                  </label>
                  <div className="flex gap-2">
                    {(["crop", "chemical", "other"] as EntryType[]).map((t) => {
                      const icons = {
                        crop: <Wheat className="h-3.5 w-3.5" />,
                        chemical: <FlaskConical className="h-3.5 w-3.5" />,
                        other: <LayoutGrid className="h-3.5 w-3.5" />,
                      };
                      const labels = { crop: "Crop", chemical: "Chemical", other: "Other" };
                      const isActive = entryType === t;
                      const activeClass =
                        t === "chemical" ? "bg-purple-600 text-white border-purple-600" :
                        t === "crop" ? "bg-amber-600 text-white border-amber-600" :
                        "bg-blue-600 text-white border-blue-600";
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setEntryType(t); setNewCropName(""); setNewAliases([]); setChemicalStatus(""); setOtherType(""); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isActive
                              ? activeClass
                              : "bg-white dark:bg-[#141414] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-600/40"
                          }`}
                        >
                          {icons[t]}
                          {labels[t]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Other-only: specify type */}
                {entryType === "other" && (
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                      Other Type
                      <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                        — e.g. Equipment, Fertilizer, Pest…
                      </span>
                    </label>
                    <Input
                      placeholder="Specify what type of item this is"
                      value={otherType}
                      onChange={(e) => setOtherType(e.target.value)}
                      className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}

                {/* Name field — label changes by type */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    {entryType === "crop" ? "Crop Name" : entryType === "chemical" ? "Chemical Name" : "Name"}
                  </label>
                  <Input
                    placeholder={entryType === "crop" ? "Paddy" : entryType === "chemical" ? "Alachlor" : "Seed Drill"}
                    value={newCropName}
                    onChange={(e) => setNewCropName(e.target.value)}
                    className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700"
                    autoFocus
                  />
                </div>

                {/* Chemical-only: status, crops */}
                {entryType === "chemical" && (
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
                    {entryType === "chemical" ? "Trade Names" : "Aliases"}
                    <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                      — optional, can add later
                    </span>
                  </label>
                  <AliasSection
                    aliases={newAliases}
                    onAliasesChange={setNewAliases}
                    isChemical={entryType === "chemical"}
                    isOther={entryType === "other"}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(entryType !== "crop" && entryType !== "chemical") || isBulkUploading}
                    className={`h-8 text-xs gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                      entryType === "chemical"
                        ? "border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
                        : "border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                    }`}
                    onClick={handleBulkUploadClick}
                  >
                    {isBulkUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {isBulkUploading ? "Uploading..." : entryType === "chemical" ? "Bulk Upload Chemicals" : "Bulk Upload Crops"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!newCropName.trim() || isSaving}
                    className={`h-8 text-xs text-white rounded-lg ${
                      entryType === "chemical"
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Saving...
                      </>
                    ) : (
                      `Save ${entryType === "crop" ? "Crop" : entryType === "chemical" ? "Chemical" : "Entry"}`
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ── CROPS TAB ──────────────────────────────────────────────────── */}
            {activeTab === "crop" && (
              <>
                <div className="px-5 pt-3 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <Input
                      id="agritech-crop-search"
                      placeholder="Search crops..."
                      value={cropSearchInput}
                      onChange={handleCropSearchChange}
                      className="h-8 pl-8 text-xs bg-gray-50 dark:bg-[#141414] border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                    {isCropTabFetching && !isCropTabLoading && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
                    )}
                  </div>
                </div>

            {/* ── Crop List ──────────────────────────────────────────────── */}
                <div className="px-5 py-3">
                  {isCropTabLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                    </div>
                  ) : cropItems.length === 0 ? (
                    <div className="text-center py-12">
                      <Wheat className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {cropSearchQuery ? `No crops matching "${cropSearchQuery}"` : "No crops added yet"}
                      </p>
                    </div>
                  ) : (
                    renderCropTable(cropItems)
                  )}
                </div>
              </>
            )}

            {/* ── CHEMICALS TAB ──────────────────────────────────────────────── */}
            {activeTab === "chemical" && (
              <>
                <div className="px-5 pt-3 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <Input
                      id="agritech-chemical-search"
                      placeholder="Search chemicals..."
                      value={chemSearchInput}
                      onChange={handleChemSearchChange}
                      className="h-8 pl-8 text-xs bg-gray-50 dark:bg-[#141414] border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                    {isChemTabFetching && !isChemTabLoading && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
                    )}
                  </div>
                </div>

                <div className="px-5 py-3">
                  {isChemTabLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                    </div>
                  ) : chemItems.length === 0 ? (
                    <div className="text-center py-12">
                      <FlaskConical className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {chemSearchQuery ? `No chemicals matching "${chemSearchQuery}"` : "No chemicals added yet"}
                      </p>
                    </div>
                  ) : (
                    renderChemicalTable(chemItems)
                  )}
                </div>
              </>
            )}

            {/* ── OTHER TAB ──────────────────────────────────────────────────── */}
            {activeTab === "other" && (
              <>
                <div className="px-5 pt-3 pb-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <Input
                      id="agritech-other-search"
                      placeholder="Search other entries..."
                      value={otherSearchInput}
                      onChange={handleOtherSearchChange}
                      className="h-8 pl-8 text-xs bg-gray-50 dark:bg-[#141414] border-gray-200 dark:border-gray-700 rounded-lg"
                    />
                    {isOtherTabFetching && !isOtherTabLoading && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
                    )}
                  </div>
                </div>

                <div className="px-5 py-3">
                  {isOtherTabLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                    </div>
                  ) : otherItems.length === 0 ? (
                    <div className="text-center py-12">
                      <LayoutGrid className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 dark:text-gray-500">
                        {otherSearchQuery ? `No entries matching "${otherSearchQuery}"` : "No other entries added yet"}
                      </p>
                    </div>
                  ) : (
                    renderOtherTable(otherItems)
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Pagination Footer (fixed inside modal) ──────────────────────── */}
          {activeTab === "crop" && cropTotalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#0f0f0f] px-4 py-2 flex items-center justify-end gap-2 flex-wrap">
              {/* Items per page */}
              <div className="relative">
                <Select
                  value={cropLimit.toString()}
                  onValueChange={(v) => { setCropLimit(Number(v)); setCropPage(1); }}
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
                onClick={() => setCropPage((p) => Math.max(1, p - 1))}
                disabled={cropPage === 1}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {/* Page numbers */}
              {(() => {
                const MAX = 5;
                let start = cropPage > MAX ? cropPage : 1;
                let end = Math.min(start + MAX - 1, cropTotalPages);
                const pages = [];
                for (let i = start; i <= end; i++) pages.push(i);
                return (
                  <>
                    {pages.map((p) => (
                      <button
                        key={p}
                        onClick={() => setCropPage(p)}
                        className={`h-6 w-6 text-[11px] rounded border transition-colors ${
                          p === cropPage
                            ? "bg-emerald-500 border-emerald-500 text-white font-semibold"
                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    {end < cropTotalPages && (
                      <button
                        onClick={() => setCropPage(end + 1)}
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
                onClick={() => setCropPage((p) => Math.min(cropTotalPages, p + 1))}
                disabled={cropPage === cropTotalPages}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
          {activeTab === "chemical" && chemTotalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#0f0f0f] px-4 py-2 flex items-center justify-end gap-2 flex-wrap">
              {/* Items per page */}
              <div className="relative">
                <Select
                  value={chemLimit.toString()}
                  onValueChange={(v) => { setChemLimit(Number(v)); setChemPage(1); }}
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
                onClick={() => setChemPage((p) => Math.max(1, p - 1))}
                disabled={chemPage === 1}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {/* Page numbers */}
              {(() => {
                const MAX = 5;
                let start = chemPage > MAX ? chemPage : 1;
                let end = Math.min(start + MAX - 1, chemTotalPages);
                const pages = [];
                for (let i = start; i <= end; i++) pages.push(i);
                return (
                  <>
                    {pages.map((p) => (
                      <button
                        key={p}
                        onClick={() => setChemPage(p)}
                        className={`h-6 w-6 text-[11px] rounded border transition-colors ${
                          p === chemPage
                            ? "bg-emerald-500 border-emerald-500 text-white font-semibold"
                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    {end < chemTotalPages && (
                      <button
                        onClick={() => setChemPage(end + 1)}
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
                onClick={() => setChemPage((p) => Math.min(chemTotalPages, p + 1))}
                disabled={chemPage === chemTotalPages}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
          {activeTab === "other" && otherTotalPages > 1 && (
            <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#0f0f0f] px-4 py-2 flex items-center justify-end gap-2 flex-wrap">
              {/* Items per page */}
              <div className="relative">
                <Select
                  value={otherLimit.toString()}
                  onValueChange={(v) => { setOtherLimit(Number(v)); setOtherPage(1); }}
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
                onClick={() => setOtherPage((p) => Math.max(1, p - 1))}
                disabled={otherPage === 1}
                className="h-6 px-2 text-[11px] rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {/* Page numbers */}
              {(() => {
                const MAX = 5;
                let start = otherPage > MAX ? otherPage : 1;
                let end = Math.min(start + MAX - 1, otherTotalPages);
                const pages = [];
                for (let i = start; i <= end; i++) pages.push(i);
                return (
                  <>
                    {pages.map((p) => (
                      <button
                        key={p}
                        onClick={() => setOtherPage(p)}
                        className={`h-6 w-6 text-[11px] rounded border transition-colors ${
                          p === otherPage
                            ? "bg-emerald-500 border-emerald-500 text-white font-semibold"
                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    {end < otherTotalPages && (
                      <button
                        onClick={() => setOtherPage(end + 1)}
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
                onClick={() => setOtherPage((p) => Math.min(otherTotalPages, p + 1))}
                disabled={otherPage === otherTotalPages}
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
    </>
  );
};
