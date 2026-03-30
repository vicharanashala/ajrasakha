import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/atoms/dialog";
import { Plus, Wheat, Pencil } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { toast } from "sonner";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Wheat className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                Crop Management
              </DialogTitle>
              <DialogDescription className="mt-1">
                View and manage crops & their aliases
              </DialogDescription>
            </div>
            <Button
              size="sm"
              className="flex items-center gap-1.5 mr-6"
              onClick={() => toast.info("Add crop coming soon!")}
            >
              <Plus className="h-4 w-4" />
              Add New Crop
            </Button>
          </div>
        </DialogHeader>

        {/* Crop List */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 mt-2">
          <div className="grid gap-3">
            {MOCK_CROPS.map((crop) => (
              <div
                key={crop.name}
                className="group flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl hover:border-amber-300 dark:hover:border-amber-500/40 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Wheat className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {crop.name}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {crop.aliases.map((alias) => (
                        <span
                          key={alias}
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg transition-all"
                  onClick={() => toast.info(`Edit "${crop.name}" coming soon!`)}
                >
                  <Pencil className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
