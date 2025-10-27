import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

interface UrlPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUrl: string | null;
}

export function UrlPreviewDialog({
  open,
  onOpenChange,
  selectedUrl,
}: UrlPreviewDialogProps) {
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
          <div className="flex-1 overflow-hidden">
            <iframe
              src={selectedUrl}
              title="Source Preview"
              className="w-full h-full border-0"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
