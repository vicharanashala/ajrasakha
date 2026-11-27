import { useId, useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";

import { Button } from "@/components/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { cn } from "@/lib/utils";

interface UploadSectionProps {
  /** Called with the selected CSV file. The parent owns parsing state. */
  onFileSelected: (file: File) => void;
  /** True while the selected file is being read and parsed. */
  isProcessing: boolean;
  /** Name of the report currently displayed, when one is loaded. */
  fileName: string | null;
  /** True when a valid report is already loaded. */
  hasReport: boolean;
}

/**
 * Phase 4: CSV upload entry point. Parsing happens entirely in the browser;
 * this component only selects a file and reports loading/current-file state.
 */
export function UploadSection({
  onFileSelected,
  isProcessing,
  fileName,
  hasReport,
}: UploadSectionProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const submitFile = (file: File | undefined) => {
    if (!file || isProcessing) return;
    onFileSelected(file);
    // Allow selecting the same file again after a failed upload.
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload evaluation report</CardTitle>
        <CardDescription>
          Select a CSV export from the AjraSakha evaluation pipeline. The file
          is validated and parsed in your browser; nothing is uploaded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            submitFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors",
            isDragging && "border-primary bg-accent/60",
          )}
        >
          <UploadCloud
            aria-hidden="true"
            className="size-8 text-muted-foreground"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium">Drop a CSV file here</p>
            <p className="text-xs text-muted-foreground">
              One report at a time. The only required column is{" "}
              <code className="font-mono">record_type</code>.
            </p>
          </div>

          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={isProcessing}
            onChange={(event) => submitFile(event.target.files?.[0])}
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Parsing…
                </>
              ) : hasReport ? (
                "Load another report"
              ) : (
                "Choose CSV file"
              )}
            </Button>
            {fileName && (
              <span className="max-w-full truncate text-xs text-muted-foreground">
                Displaying: <span className="font-medium">{fileName}</span>
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
