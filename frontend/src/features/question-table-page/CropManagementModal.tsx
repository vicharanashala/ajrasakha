import { useState, useRef, type KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import { Plus, Wheat, Pencil, X, Loader2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { toast } from "sonner";
import { useCreateCrop } from "@/hooks/api/crop/useCreateCrop";

// Hardcoded crop data — will be replaced with API integration later
const MOCK_CROPS = [
  { name: "Paddy", aliases: ["Rice", "Chawal", "ধান"] },
  { name: "Wheat", aliases: ["Gehun", "Kanak"] },
  { name: "Maize", aliases: ["Corn", "Makka", "Bhutta"] },
  { name: "Sugarcane", aliases: ["Ganna", "Ikh"] },
  { name: "Cotton", aliases: ["Kapas", "Rui"] },
  { name: "Soybean", aliases: ["Soya"] },
  { name: "Groundnut", aliases: ["Peanut", "Moongphali"] },
  { name: "Mustard", aliases: ["Sarson", "Rai"] },
];

type CropManagementModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const CropManagementModal = ({
  open,
  onOpenChange,
}: CropManagementModalProps) => {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newCropName, setNewCropName] = useState("");
  const [newAliases, setNewAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const aliasInputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: createCrop, isPending: isCreating } = useCreateCrop();

  const handleAddAlias = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !newAliases.includes(trimmed)) {
      setNewAliases((prev) => [...prev, trimmed]);
    }
    setAliasInput("");
  };

  const handleAliasKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddAlias(aliasInput);
    }
    if (e.key === "Backspace" && aliasInput === "" && newAliases.length > 0) {
      setNewAliases((prev) => prev.slice(0, -1));
    }
  };

  const removeAlias = (alias: string) => {
    setNewAliases((prev) => prev.filter((a) => a !== alias));
  };

  const resetForm = () => {
    setNewCropName("");
    setNewAliases([]);
    setAliasInput("");
    setIsAddFormOpen(false);
  };

  const handleSave = async () => {
    try {
      const res = await createCrop({
        name: newCropName.trim(),
        aliases: newAliases.length > 0 ? newAliases : undefined,
      });
      if (res?.success) {
        toast.success(`Crop "${newCropName.trim()}" added successfully!`);
        resetForm();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to add crop");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent
        className="sm:max-w-[520px] max-w-[95vw] h-[70vh] p-0 flex flex-col overflow-hidden gap-0"
        showCloseButton={false}
      >
        {/* ── Fixed Header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Wheat className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
                Crop Management
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Manage crop names & aliases
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              onClick={() => setIsAddFormOpen(!isAddFormOpen)}
            >
              <Plus className={`h-3.5 w-3.5 transition-transform duration-200 ${isAddFormOpen ? "rotate-45" : ""}`} />
              {isAddFormOpen ? "Cancel" : "Add Crop"}
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Add Form (inline, slides in) */}
          {isAddFormOpen && (
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 bg-amber-50/40 dark:bg-amber-500/[0.03]">
              <div className="space-y-3">
                {/* Crop Name */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Crop Name
                  </label>
                  <Input
                    placeholder="e.g. Jowar"
                    value={newCropName}
                    onChange={(e) => setNewCropName(e.target.value)}
                    className="h-9 text-sm bg-white dark:bg-[#141414]"
                    autoFocus
                  />
                </div>

                {/* Aliases */}
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Aliases
                    <span className="font-normal normal-case ml-1 text-gray-400 dark:text-gray-600 tracking-normal">
                      — press Enter to add
                    </span>
                  </label>
                  <div
                    className="flex flex-wrap gap-1.5 p-2 min-h-[36px] bg-white dark:bg-[#141414] border border-input rounded-md cursor-text focus-within:ring-1 focus-within:ring-ring"
                    onClick={() => aliasInputRef.current?.focus()}
                  >
                    {newAliases.map((alias) => (
                      <span
                        key={alias}
                        className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-500/25"
                      >
                        {alias}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAlias(alias);
                          }}
                          className="p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-500/20 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <input
                      ref={aliasInputRef}
                      type="text"
                      placeholder={newAliases.length === 0 ? "Type alias & press Enter" : ""}
                      value={aliasInput}
                      onChange={(e) => setAliasInput(e.target.value)}
                      onKeyDown={handleAliasKeyDown}
                      onBlur={() => {
                        if (aliasInput.trim()) handleAddAlias(aliasInput);
                      }}
                      className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600 dark:text-white py-0.5"
                    />
                  </div>
                </div>

                {/* Save */}
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!newCropName.trim() || isCreating}
                    className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white"
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
            </div>
          )}

          {/* Crop List */}
          <div className="px-5 py-3">
            <div className="space-y-1">
              {MOCK_CROPS.map((crop) => (
                <div
                  key={crop.name}
                  className="group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-amber-100/80 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Wheat className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                        {crop.name}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {crop.aliases.map((alias) => (
                          <span
                            key={alias}
                            className="px-1.5 py-px rounded text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-200 dark:hover:bg-white/10 rounded-md transition-all flex-shrink-0"
                    onClick={() => toast.info(`Edit "${crop.name}" coming soon!`)}
                  >
                    <Pencil className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
