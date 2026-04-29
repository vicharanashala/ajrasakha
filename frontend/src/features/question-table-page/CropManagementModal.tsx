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
import { Plus, Cpu, Wheat, Pencil, X, Loader2, Check } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { toast } from "sonner";
import { useCreateCrop } from "@/hooks/api/crop/useCreateCrop";
import { useUpdateCrop } from "@/hooks/api/crop/useUpdateCrop";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import type { ICropAlias, ICropResponse } from "@/hooks/services/cropService";

// local alias for readability
type ICropAliasObject = ICropAlias;

// All 22 scheduled languages of India + widely spoken regional languages
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

// Returns { en, native } for a language code, falling back to the code itself
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

// ── AliasSection ──────────────────────────────────────────────────────────────
// Self-contained alias entry: manages its own entry-form state,
// reports final list changes upward via onAliasesChange.
const AliasSection = ({
  aliases,
  onAliasesChange,
  accentColor,
}: {
  aliases: ICropAliasObject[];
  onAliasesChange: (next: ICropAliasObject[]) => void;
  accentColor: "amber" | "blue";
}) => {
  const [entry, setEntry] = useState<ICropAliasObject>(emptyAliasEntry());

  const isAmber = accentColor === "amber";

  const langBadge = isAmber
    ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-500/25"
    : "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-200/80 dark:border-blue-500/25";

  const addBtnClass = isAmber
    ? "bg-amber-600 hover:bg-amber-700 text-white"
    : "bg-blue-600 hover:bg-blue-700 text-white";

  const removeHover = isAmber
    ? "hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400"
    : "hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400";

  const canAdd =
    entry.language.trim() !== "" &&
    entry.region.trim() !== "" &&
    entry.english_representation.trim() !== "" &&
    entry.native_representation.trim() !== "";

  const handleAdd = () => {
    if (!canAdd) return;
    onAliasesChange([...aliases, { ...entry }]);
    setEntry(emptyAliasEntry());
  };

  const handleRemove = (i: number) => {
    onAliasesChange(aliases.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-2">
      {/* ── Entry form ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-[#141414] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          {/* Language */}
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
                className="h-8 text-xs w-full bg-white dark:bg-[#141414] border-gray-200 dark:border-gray-700"
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

          {/* Region */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
              Region
            </span>
            <Input
              placeholder="e.g. Andhra and Telangana"
              value={entry.region}
              onChange={(e) => setEntry((f) => ({ ...f, region: e.target.value }))}
              className="h-8 text-xs bg-white dark:bg-[#141414] border-gray-200 dark:border-gray-700"
            />
          </div>

          {/* English repr */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
              English Representation
            </span>
            <Input
              placeholder="e.g. vari"
              value={entry.english_representation}
              onChange={(e) => setEntry((f) => ({ ...f, english_representation: e.target.value }))}
              className="h-8 text-xs bg-white dark:bg-[#141414] border-gray-200 dark:border-gray-700"
            />
          </div>

          {/* Native repr */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
              Native Representation
            </span>
            <Input
              placeholder="e.g. వరి"
              value={entry.native_representation}
              onChange={(e) => setEntry((f) => ({ ...f, native_representation: e.target.value }))}
              className="h-8 text-xs bg-white dark:bg-[#141414] border-gray-200 dark:border-gray-700"
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

      {/* ── Alias cards ───────────────────────────────────────────────── */}
      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {aliases.map((alias, i) => (
            <span
              key={i}
              className={`group relative inline-flex flex-col gap-1.5 px-3 py-2 rounded-lg border min-w-[140px] ${
                isAmber
                  ? "bg-amber-50 dark:bg-amber-500/[0.06] border-amber-100 dark:border-amber-500/15"
                  : "bg-blue-50 dark:bg-blue-500/[0.06] border-blue-100 dark:border-blue-500/15"
              }`}
            >
              {/* Language & Region row */}
              <span className="flex items-center gap-2 flex-wrap pr-4">
                <span className="flex items-center gap-1">
                  <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Language:</span>
                  <span className={`text-[11px] font-bold leading-tight ${isAmber ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}`}>
                    {getLangInfo(alias.language).en}
                  </span>
                </span>
                {alias.region && (
                  <span className="flex items-center gap-1">
                    <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Region:</span>
                    <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-tight">
                      {alias.region}
                    </span>
                  </span>
                )}
              </span>
              {/* English & Native names row */}
              <span className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">English:</span>
                  <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 leading-tight">
                    {alias.english_representation}
                  </span>
                </span>
                <span className="text-gray-300 dark:text-gray-600 select-none">·</span>
                <span className="flex items-center gap-1">
                  <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Native:</span>
                  <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-tight">
                    {alias.native_representation}
                  </span>
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className={`absolute top-1 right-1 p-0.5 rounded transition-opacity ${removeHover}`}
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
  // ── Add Form State
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newCropName, setNewCropName] = useState("");
  const [newAliases, setNewAliases] = useState<ICropAliasObject[]>([]);

  // ── Edit State
  const [editingCropId, setEditingCropId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAliases, setEditAliases] = useState<ICropAliasObject[]>([]);
  const [editLegacyAliases, setEditLegacyAliases] = useState<string[]>([]);

  // ── API Hooks
  const { mutateAsync: createCrop, isPending: isCreating } = useCreateCrop();
  const { mutateAsync: updateCrop, isPending: isUpdating } = useUpdateCrop();
  const { data: cropsData, isLoading: isLoadingCrops } = useGetAllCrops();

  const crops = cropsData?.crops || [];

  // ── Actions
  const resetForm = () => {
    setNewCropName("");
    setNewAliases([]);
    setIsAddFormOpen(false);
  };

  const startEditing = (crop: ICropResponse) => {
    setEditingCropId(crop._id || null);
    setEditName(crop.name);
    // Split legacy (string) aliases from new (object) aliases
    const all = crop.aliases || [];
    setEditLegacyAliases(all.filter((a): a is string => typeof a === "string"));
    setEditAliases(all.filter((a): a is ICropAliasObject => typeof a !== "string"));
    if (isAddFormOpen) resetForm();
  };

  const cancelEditing = () => {
    setEditingCropId(null);
    setEditName("");
    setEditAliases([]);
    setEditLegacyAliases([]);
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

  const handleEditSave = async () => {
    if (!editingCropId) return;
    if (!window.confirm(`Are you sure you want to update aliases for "${editName}"?`)) return;
    try {
      const res = await updateCrop({
        cropId: editingCropId,
        payload: { aliases: [...editLegacyAliases, ...editAliases] },
      });
      if (res?.success) {
        toast.success(`Aliases for "${editName}" updated successfully!`);
        cancelEditing();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update crop");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          resetForm();
          cancelEditing();
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
              onClick={() => {
                cancelEditing();
                setIsAddFormOpen(!isAddFormOpen);
              }}
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
              {/* Crop Name */}
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

              {/* Aliases */}
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Aliases
                </label>
                <AliasSection
                  aliases={newAliases}
                  onAliasesChange={setNewAliases}
                  accentColor="amber"
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
              <div className="space-y-1.5">
                {crops.map((crop, index) => {
                  const isEditing = editingCropId === crop._id;

                  if (isEditing) {
                    return (
                      <div
                        key={crop._id || crop.name}
                        className="p-4 rounded-xl border-l-[3px] border-l-blue-500 border border-blue-200/60 dark:border-blue-500/15 bg-blue-50/30 dark:bg-blue-500/[0.03] space-y-3"
                      >
                        {/* Crop Name (immutable) */}
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                            Crop Name
                            <span className="font-normal normal-case ml-1 text-gray-400 dark:text-gray-600 tracking-normal">
                              — cannot be changed
                            </span>
                          </label>
                          <Input
                            value={editName}
                            disabled
                            className="h-9 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed capitalize"
                          />
                        </div>

                        {/* Legacy aliases (old string format) */}
                        {editLegacyAliases.length > 0 && (
                          <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                              Legacy Aliases
                              <span className="font-normal normal-case tracking-normal text-gray-400 dark:text-gray-600">— click × to remove</span>
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {editLegacyAliases.map((alias) => (
                                <span
                                  key={alias}
                                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-medium border bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                                >
                                  {alias}
                                  <button
                                    onClick={() => setEditLegacyAliases((prev) => prev.filter((a) => a !== alias))}
                                    className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* New structured aliases */}
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                            {editLegacyAliases.length > 0 ? "Add Structured Alias" : "Aliases"}
                          </label>
                          <AliasSection
                            aliases={editAliases}
                            onAliasesChange={setEditAliases}
                            accentColor="blue"
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEditing}
                            className="h-8 text-xs rounded-lg"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleEditSave}
                            disabled={isUpdating}
                            className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                          >
                            {isUpdating ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Saving...
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
                    );
                  }

                  return (
                    <div key={crop._id || crop.name}>
                      <div className="group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-amber-100/80 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <Wheat className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight capitalize">
                              {crop.name}
                            </p>
                            {crop.aliases && crop.aliases.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {crop.aliases.map((alias, i) =>
                                  typeof alias === "string" ? (
                                    <span
                                      key={i}
                                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60"
                                    >
                                      {alias}
                                    </span>
                                  ) : (
                                    <span
                                      key={i}
                                      className="inline-flex flex-col gap-1.5 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/[0.06] border border-amber-100 dark:border-amber-500/15 min-w-[140px]"
                                    >
                                      {/* Language & Region row */}
                                      <span className="flex items-center gap-2 flex-wrap">
                                        <span className="flex items-center gap-1">
                                          <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Language:</span>
                                          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 leading-tight">
                                            {getLangInfo(alias.language).en}
                                          </span>
                                        </span>
                                        {alias.region && (
                                          <span className="flex items-center gap-1">
                                            <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Region:</span>
                                            <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-tight">
                                              {alias.region}
                                            </span>
                                          </span>
                                        )}
                                      </span>
                                      {/* English & Native names row */}
                                      <span className="flex items-center gap-2 flex-wrap">
                                        <span className="flex items-center gap-1">
                                          <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">English:</span>
                                          <span className="text-[11px] font-medium text-gray-800 dark:text-gray-200 leading-tight">
                                            {alias.english_representation}
                                          </span>
                                        </span>
                                        <span className="text-gray-300 dark:text-gray-600 select-none">·</span>
                                        <span className="flex items-center gap-1">
                                          <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Native:</span>
                                          <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-tight">
                                            {alias.native_representation}
                                          </span>
                                        </span>
                                      </span>
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-all flex-shrink-0 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent hover:border-blue-100 dark:hover:border-blue-500/20 shadow-sm"
                          onClick={() => startEditing(crop)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                      {index < crops.length - 1 && !editingCropId && (
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
  );
};
