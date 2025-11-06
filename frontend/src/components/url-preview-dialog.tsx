import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface UrlPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUrl: string | null;
}

export const UrlPreviewDialog = ({
  open,
  onOpenChange,
  selectedUrl,
}: UrlPreviewDialogProps) => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!inset-4 !top-4 !left-4 !right-4 !bottom-4 !translate-x-0 !translate-y-0 !max-w-none !w-auto !h-auto !p-0 !rounded-lg !border flex flex-col"
        showCloseButton={true}
      >
        <DialogHeader className="flex-shrink-0 px-4 py-3 border-b bg-background">
          <DialogTitle className="text-xs font-medium text-muted-foreground truncate font-mono">
            {selectedUrl || "about:blank"}
          </DialogTitle>
        </DialogHeader>

        {selectedUrl && (
          <div className="relative flex-1 overflow-hidden">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="sr-only">Loading preview...</span>
              </div>
            )}

            <iframe
              src={selectedUrl}
              title="Source Preview"
              className="w-full h-full border-0"
              onLoad={() => setIsLoading(false)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
