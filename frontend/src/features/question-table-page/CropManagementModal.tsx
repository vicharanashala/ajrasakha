import { useState } from "react";
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
import { Plus, Cpu, Wheat, Pencil, X, Loader2, Check, Languages, Trash2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { toast } from "sonner";
import { useCreateCrop } from "@/hooks/api/crop/useCreateCrop";
import { useUpdateCrop } from "@/hooks/api/crop/useUpdateCrop";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import type { ICropAlias, ICropResponse } from "@/hooks/services/cropService";

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

const getLangInfo = (code: string) =>
  INDIAN_LANGUAGES.find((l) => l.code === code) ?? { en: code, native: "" };

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
}: {
  onAdd: (alias: ICropAliasObject) => void;
  accentColor?: "amber" | "blue";
}) => {
  const [entry, setEntry] = useState<ICropAliasObject>(emptyAliasEntry());
  const isAmber = accentColor === "amber";

  const addBtnClass = isAmber
    ? "bg-amber-600 hover:bg-amber-700 text-white"
    : "bg-blue-600 hover:bg-blue-700 text-white";

  const canAdd =
    entry.language.trim() !== "" &&
    entry.region.trim() !== "" &&
    entry.english_representation.trim() !== "" &&
    entry.native_representation.trim() !== "";

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({ ...entry });
    setEntry(emptyAliasEntry());
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-[#141414] p-4 space-y-3">
      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Add New Alias
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
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {INDIAN_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code} className="text-xs">
                  <span className="font-mono">{lang.code}</span>
                  <span className="text-gray-400 dark:text-gray-500 ml-1.5">— {lang.en}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            Region
          </span>
          <Input
            placeholder="e.g. Andhra & Telangana"
            value={entry.region}
            onChange={(e) => setEntry((f) => ({ ...f, region: e.target.value }))}
            className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
          />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            English Name
          </span>
          <Input
            placeholder="e.g. vari"
            value={entry.english_representation}
            onChange={(e) => setEntry((f) => ({ ...f, english_representation: e.target.value }))}
            className="h-8 text-xs bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
          />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
            Native Name
          </span>
          <Input
            placeholder="e.g. వరి"
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
          Add Alias
        </Button>
      </div>
    </div>
  );
};

// ── AliasManagerModal ─────────────────────────────────────────────────────────
// Dedicated modal for viewing, adding, and deleting aliases for a single crop.
const AliasManagerModal = ({
  crop,
  onClose,
}: {
  crop: ICropResponse;
  onClose: () => void;
}) => {
  const all = crop.aliases || [];
  const [legacyAliases, setLegacyAliases] = useState<string[]>(
    all.filter((a): a is string => typeof a === "string")
  );
  const [structuredAliases, setStructuredAliases] = useState<ICropAliasObject[]>(
    all.filter((a): a is ICropAliasObject => typeof a !== "string")
  );

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
    if (!window.confirm(`Update aliases for "${crop.name}"?`)) return;
    try {
      const res = await updateCrop({
        cropId: crop._id,
        payload: { aliases: [...legacyAliases, ...structuredAliases] },
      });
      if (res?.success) {
        toast.success(`Aliases for "${crop.name}" updated successfully!`);
        onClose();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update aliases");
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
            <div className="w-9 h-9 rounded-xl bg-amber-100/80 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Wheat className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
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
              <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
                {/* Table header */}
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

                {/* Table rows */}
                {structuredAliases.map((alias, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-[1fr_1fr_1fr_1fr_32px] gap-0 items-center group transition-colors
                      ${i < structuredAliases.length - 1 ? "border-b border-gray-100 dark:border-gray-800/60" : ""}
                      hover:bg-gray-50/60 dark:hover:bg-white/[0.02]`}
                  >
                    <div className="px-3 py-2.5 min-w-0">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/15">
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 leading-tight truncate">
                          {getLangInfo(alias.language).en}
                        </span>
                      </span>
                    </div>
                    <div className="px-3 py-2.5 min-w-0">
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate block">
                        {alias.region || <span className="text-gray-300 dark:text-gray-600">—</span>}
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
                        onClick={() => handleRemoveStructured(i)}
                        className="p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        title="Remove alias"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
          <AliasEntryForm onAdd={handleAdd} accentColor="amber" />
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
}: {
  aliases: ICropAliasObject[];
  onAliasesChange: (next: ICropAliasObject[]) => void;
}) => {
  const handleAdd = (alias: ICropAliasObject) => {
    onAliasesChange([...aliases, alias]);
  };

  const handleRemove = (i: number) => {
    onAliasesChange(aliases.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      <AliasEntryForm onAdd={handleAdd} accentColor="amber" />
      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {aliases.map((alias, i) => (
            <span
              key={i}
              className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-amber-50 dark:bg-amber-500/[0.06] border-amber-100 dark:border-amber-500/15"
            >
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                {getLangInfo(alias.language).en}
              </span>
              <span className="text-gray-300 dark:text-gray-600 select-none">·</span>
              <span className="text-[11px] text-gray-600 dark:text-gray-400">
                {alias.english_representation}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="p-0.5 rounded transition-colors text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Modal ────────────────────────────────────────────────────────────────
export const CropManagementModal = ({
  open,
  onOpenChange,
}: CropManagementModalProps) => {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newCropName, setNewCropName] = useState("");
  const [newAliases, setNewAliases] = useState<ICropAliasObject[]>([]);
  const [aliasManagerCrop, setAliasManagerCrop] = useState<ICropResponse | null>(null);

  const { mutateAsync: createCrop, isPending: isCreating } = useCreateCrop();
  const { data: cropsData, isLoading: isLoadingCrops } = useGetAllCrops();

  const crops = cropsData?.crops || [];

  const resetForm = () => {
    setNewCropName("");
    setNewAliases([]);
    setIsAddFormOpen(false);
  };

  const handleSave = async () => {
    const name = newCropName.trim();
    if (!name) return;
    if (!window.confirm(`Are you sure you want to create the crop "${name}"?`)) return;
    try {
      const res = await createCrop({
        name,
        aliases: newAliases.length > 0 ? newAliases : undefined,
      });
      if (res?.success) {
        toast.success(`Crop "${name}" added successfully!`);
        resetForm();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to add crop");
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) {
            resetForm();
            setAliasManagerCrop(null);
          }
          onOpenChange(val);
        }}
      >
        <DialogContent
          className="sm:max-w-[540px] max-w-[95vw] h-[75vh] p-0 flex flex-col overflow-hidden gap-0"
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
                Manage crop names & aliases
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              >
                <Plus
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    isAddFormOpen ? "rotate-45" : ""
                  }`}
                />
                {isAddFormOpen ? "Cancel" : "Add Crop"}
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

          {/* ── Scrollable Body ─────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Add Form ────────────────────────────────────────────────── */}
            {isAddFormOpen && (
              <div className="mx-5 mt-4 mb-3 p-4 rounded-xl border-l-[3px] border-l-amber-500 border border-amber-200/60 dark:border-amber-500/15 bg-amber-50/30 dark:bg-amber-500/[0.03] space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Crop Name
                  </label>
                  <Input
                    placeholder="e.g. Jowar"
                    value={newCropName}
                    onChange={(e) => setNewCropName(e.target.value)}
                    className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Aliases
                    <span className="font-normal normal-case tracking-normal ml-1 text-gray-400 dark:text-gray-600">
                      — optional, can add later
                    </span>
                  </label>
                  <AliasSection
                    aliases={newAliases}
                    onAliasesChange={setNewAliases}
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!newCropName.trim() || isCreating}
                    className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Saving...
                      </>
                    ) : (
                      "Save Crop"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* ── Crop List ──────────────────────────────────────────────── */}
            <div className="px-5 py-3">
              {isLoadingCrops ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : crops.length === 0 ? (
                <div className="text-center py-12">
                  <Wheat className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No crops added yet</p>
                </div>
              ) : (
                <div className="space-y-px">
                  {crops.map((crop, index) => {
                    const aliasCount = (crop.aliases || []).length;

                    return (
                      <div key={crop._id || crop.name}>
                        <div className="group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-amber-100/80 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                              <Wheat className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight capitalize">
                                {crop.name}
                              </p>
                              {aliasCount > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 leading-tight">
                                  {aliasCount} alias{aliasCount !== 1 ? "es" : ""}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 border border-transparent hover:border-blue-100 dark:hover:border-blue-500/20 transition-all flex-shrink-0"
                            onClick={() => setAliasManagerCrop(crop)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Manage Aliases</span>
                          </button>
                        </div>
                        {index < crops.length - 1 && (
                          <div className="mx-3 border-b border-gray-100 dark:border-gray-800/50" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Alias Manager Sub-Modal ─────────────────────────────────────────── */}
      {aliasManagerCrop && (
        <AliasManagerModal
          crop={aliasManagerCrop}
          onClose={() => setAliasManagerCrop(null)}
        />
      )}
    </>
  );
};
