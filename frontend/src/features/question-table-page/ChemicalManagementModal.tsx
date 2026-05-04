import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";

import { Plus, FlaskConical, Pencil, X, Loader2, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { toast } from "sonner";
import { useCreateChemical } from "@/hooks/api/chemical/useCreateChemical";
import { useUpdateChemical } from "@/hooks/api/chemical/useUpdateChemical";
import { useDeleteChemical } from "@/hooks/api/chemical/useDeleteChemical";
import { useGetAllChemicals } from "@/hooks/api/chemical/useGetAllChemicals";
import type { IChemical } from "@/hooks/services/chemicalService";

type ChemicalManagementModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ChemicalManagementModal = ({
  open,
  onOpenChange,
}: ChemicalManagementModalProps) => {
  // ── Add Form State
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newChemicalName, setNewChemicalName] = useState("");
  const [newChemicalStatus, setNewChemicalStatus] = useState<'Restricted' | 'Banned'>('Restricted');

  // ── Edit State
  const [editingChemicalId, setEditingChemicalId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<'Restricted' | 'Banned'>('Restricted');

  // ── API Hooks
  const { mutateAsync: createChemical, isPending: isCreating } = useCreateChemical();
  const { mutateAsync: updateChemical, isPending: isUpdating } = useUpdateChemical();
  const { mutateAsync: deleteChemical, isPending: isDeleting } = useDeleteChemical();
  const { data: chemicalsData, isLoading: isLoadingChemicals } = useGetAllChemicals();

  const chemicals = chemicalsData?.chemicals || [];

  // ── Actions
  const resetForm = () => {
    setNewChemicalName("");
    setNewChemicalStatus('Restricted');
    setIsAddFormOpen(false);
  };

  const startEditing = (chemical: IChemical) => {
    setEditingChemicalId(chemical._id || null);
    setEditName(chemical.name);
    setEditStatus(chemical.status);
    if (isAddFormOpen) resetForm();
  };

  const cancelEditing = () => {
    setEditingChemicalId(null);
    setEditName("");
    setEditStatus('Restricted');
  };

  const handleSave = async () => {
    const name = newChemicalName.trim();
    try {
      const res = await createChemical({
        name,
        status: newChemicalStatus,
      });
      if (res?.success) {
        resetForm();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to add chemical");
    }
  };

  const handleEditSave = async () => {
    if (!editingChemicalId) return;
    if (!window.confirm(`Are you sure you want to update "${editName}"?`)) return;
    try {
      const res = await updateChemical({
        chemicalId: editingChemicalId,
        payload: { 
          name: editName,
          status: editStatus 
        },
      });
      if (res?.success) {
        cancelEditing();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update chemical");
    }
  };

  const handleDelete = async (chemical: IChemical) => {
    if (!window.confirm(`Are you sure you want to delete "${chemical.name}"? This action cannot be undone.`)) return;
    try {
      const res = await deleteChemical(chemical._id!);
      if (res?.success) {
        // Success toast is handled by React Query hook
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete chemical");
    }
  };

  const getStatusColor = (status: 'Restricted' | 'Banned') => {
    return status === 'Restricted' 
      ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-500/25'
      : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200/80 dark:border-red-500/25';
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
              <FlaskConical className="h-[18px] w-[18px] text-purple-600 dark:text-purple-400" />
              Chemical Management
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Manage chemical names and status
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
              onClick={() => {
                cancelEditing();
                setIsAddFormOpen(!isAddFormOpen);
              }}
            >
              <Plus className={`h-3.5 w-3.5 transition-transform duration-200 ${isAddFormOpen ? "rotate-45" : ""}`} />
              {isAddFormOpen ? "Cancel" : "Add Chemical"}
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

        {/* ── Scrollable Body ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Add Form */}
          {isAddFormOpen && (
            <div className="mx-5 mt-4 mb-3 p-4 rounded-xl border-l-[3px] border-l-purple-500 border border-purple-200/60 dark:border-purple-500/15 bg-purple-50/30 dark:bg-purple-500/[0.03] space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Chemical Name
                </label>
                <Input
                  placeholder="e.g. Glyphosate"
                  value={newChemicalName}
                  onChange={(e) => setNewChemicalName(e.target.value)}
                  className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Status
                </label>
                <select
                  value={newChemicalStatus}
                  onChange={(e) => setNewChemicalStatus(e.target.value as 'Restricted' | 'Banned')}
                  className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700 px-3 w-full"
                >
                  <option value="Restricted">Restricted</option>
                  <option value="Banned">Banned</option>
                </select>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!newChemicalName.trim() || isCreating}
                  className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Saving...
                    </>
                  ) : (
                    "Save Chemical"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Chemical List */}
          <div className="px-5 py-3">
            {isLoadingChemicals ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : chemicals.length === 0 ? (
              <div className="text-center py-12">
                <FlaskConical className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No chemicals added yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {chemicals.map((chemical: IChemical, index: number) => {
                  const isEditing = editingChemicalId === chemical._id;

                  if (isEditing) {
                    return (
                      <div
                        key={chemical._id || chemical.name}
                        className="p-4 rounded-xl border-l-[3px] border-l-blue-500 border border-blue-200/60 dark:border-blue-500/15 bg-blue-50/30 dark:bg-blue-500/[0.03] space-y-3"
                      >
                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                            Chemical Name
                          </label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                            Status
                          </label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as 'Restricted' | 'Banned')}
                            className="h-9 text-sm bg-white dark:bg-[#141414] rounded-lg border-gray-200 dark:border-gray-700 px-3 w-full"
                          >
                            <option value="Restricted">Restricted</option>
                            <option value="Banned">Banned</option>
                          </select>
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
                    <div key={chemical._id || chemical.name}>
                      <div className="group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-purple-100/80 dark:bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                            <FlaskConical className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="min-w-0 flex gap-3 items-center">
                            <p className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                              {chemical.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`px-2 py-0.5 rounded text-[12px] font-medium border ${getStatusColor(chemical.status)}`}
                              >
                                {chemical.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            className="p-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-all flex-shrink-0 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent hover:border-blue-100 dark:hover:border-blue-500/20 shadow-sm"
                            onClick={() => startEditing(chemical)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all flex-shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-transparent hover:border-red-100 dark:hover:border-red-500/20 shadow-sm"
                            onClick={() => handleDelete(chemical)}
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {index < chemicals.length - 1 && !editingChemicalId && (
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
