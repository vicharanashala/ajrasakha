import { useState, useRef, type KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";

import { Plus, Wheat, Pencil, X, Loader2, Check } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { toast } from "sonner";
import { useCreateCrop } from "@/hooks/api/crop/useCreateCrop";
import { useUpdateCrop } from "@/hooks/api/crop/useUpdateCrop";
import { useGetAllCrops } from "@/hooks/api/crop/useGetAllCrops";
import type { ICropResponse } from "@/hooks/services/cropService";

type CropManagementModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// ── Reusable tag input (defined outside to avoid remount on parent re-render)
const TagInput = ({
  aliases,
  inputValue,
  inputRef,
  onInputChange,
  onKeyDown,
  onBlur,
  onRemove,
  onAdd,
  accentColor,
}: {
  aliases: string[];
  inputValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (val: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onRemove: (alias: string) => void;
  onAdd: () => void;
  accentColor: "amber" | "blue";
}) => {
  const tagBg =
    accentColor === "amber"
      ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-500/25"
      : "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200/80 dark:border-blue-500/25";

  const tagHover =
    accentColor === "amber"
      ? "hover:bg-amber-200 dark:hover:bg-amber-500/20"
      : "hover:bg-blue-200 dark:hover:bg-blue-500/20";

  return (
    <div
      className="flex flex-wrap gap-1.5 p-2.5 min-h-[40px] bg-white dark:bg-[#141414] border border-gray-200 dark:border-gray-700 rounded-lg cursor-text focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-gray-300 dark:focus-within:border-gray-600 transition-all"
      onClick={() => inputRef.current?.focus()}
    >
      {aliases.map((alias) => (
        <span
          key={alias}
          className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-medium border ${tagBg}`}
        >
          {alias}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(alias);
            }}
            className={`p-0.5 rounded-sm ${tagHover} transition-colors`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        placeholder={aliases.length === 0 ? "Type alias & press Enter or use comma" : ""}
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600 dark:text-white py-0.5"
      />
      {inputValue.trim() && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className={`flex-shrink-0 flex items-center justify-center p-1 rounded-md transition-colors ${tagBg} ${tagHover}`}
          title="Add alias"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

export const CropManagementModal = ({
  open,
  onOpenChange,
}: CropManagementModalProps) => {
  // ── Add Form State
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newCropName, setNewCropName] = useState("");
  const [newAliases, setNewAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState("");
  const aliasInputRef = useRef<HTMLInputElement>(null);

  // ── Edit State
  const [editingCropId, setEditingCropId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAliases, setEditAliases] = useState<string[]>([]);
  const [editAliasInput, setEditAliasInput] = useState("");
  const editAliasInputRef = useRef<HTMLInputElement>(null);


  // ── API Hooks
  const { mutateAsync: createCrop, isPending: isCreating } = useCreateCrop();
  const { mutateAsync: updateCrop, isPending: isUpdating } = useUpdateCrop();
  const { data: cropsData, isLoading: isLoadingCrops } = useGetAllCrops();

  const crops = cropsData?.crops || [];

  // ── Add Alias Helpers
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

  // ── Edit Alias Helpers
  const handleEditAddAlias = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !editAliases.includes(trimmed)) {
      setEditAliases((prev) => [...prev, trimmed]);
    }
    setEditAliasInput("");
  };

  const handleEditAliasKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleEditAddAlias(editAliasInput);
    }
    if (e.key === "Backspace" && editAliasInput === "" && editAliases.length > 0) {
      setEditAliases((prev) => prev.slice(0, -1));
    }
  };

  const removeEditAlias = (alias: string) => {
    setEditAliases((prev) => prev.filter((a) => a !== alias));
  };

  // ── Actions
  const resetForm = () => {
    setNewCropName("");
    setNewAliases([]);
    setAliasInput("");
    setIsAddFormOpen(false);
  };

  const startEditing = (crop: ICropResponse) => {
    setEditingCropId(crop._id || null);
    setEditName(crop.name);
    setEditAliases(crop.aliases || []);
    setEditAliasInput("");
    if (isAddFormOpen) resetForm();
  };

  const cancelEditing = () => {
    setEditingCropId(null);
    setEditName("");
    setEditAliases([]);
    setEditAliasInput("");
  };

  const handleSave = async () => {
    const name = newCropName.trim();
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
        payload: { aliases: editAliases },
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
        className="sm:max-w-[520px] max-w-[95vw] h-[70vh] p-0 flex flex-col overflow-hidden gap-0"
        showCloseButton={false}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <DialogHeader className="space-y-0.5">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Wheat className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
              Crop Management
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

          {/* Add Form */}
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
                  <span className="font-normal normal-case ml-1 text-gray-400 dark:text-gray-600 tracking-normal">
                    — press Enter to add
                  </span>
                </label>
                <TagInput
                  aliases={newAliases}
                  inputValue={aliasInput}
                  inputRef={aliasInputRef}
                  onInputChange={setAliasInput}
                  onKeyDown={handleAliasKeyDown}
                  onBlur={() => { if (aliasInput.trim()) handleAddAlias(aliasInput); }}
                  onRemove={removeAlias}
                  onAdd={() => { if (aliasInput.trim()) handleAddAlias(aliasInput); }}
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

          {/* Crop List */}
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

                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                            Aliases
                            <span className="font-normal normal-case ml-1 text-gray-400 dark:text-gray-600 tracking-normal">
                              — press Enter to add
                            </span>
                          </label>
                          <TagInput
                            aliases={editAliases}
                            inputValue={editAliasInput}
                            inputRef={editAliasInputRef}
                            onInputChange={setEditAliasInput}
                            onKeyDown={handleEditAliasKeyDown}
                            onBlur={() => { if (editAliasInput.trim()) handleEditAddAlias(editAliasInput); }}
                            onRemove={removeEditAlias}
                            onAdd={() => { if (editAliasInput.trim()) handleEditAddAlias(editAliasInput); }}
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
                              <div className="flex flex-wrap gap-1 mt-1">
                                {crop.aliases.map((alias) => (
                                  <span
                                    key={alias}
                                    className="px-1.5 py-px rounded text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 capitalize"
                                  >
                                    {alias}
                                  </span>
                                ))}
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
