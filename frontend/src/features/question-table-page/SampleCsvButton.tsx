import { Button } from "@/components/atoms/button";
import { Download } from "lucide-react";

// Headers match the bulk-upload parsers (case-insensitive). Multiple rows sharing the
// same Crop Name / input_chemical = multiple aliases for that entry.
const CROP_SAMPLE = [
  "Crop Name,Language,Region,English Name,Native Name",
  "Rice,Hindi,North India,dhan,धान",
  "Rice,Telugu,Andhra and Telangana,vari,వరి",
  "Wheat,Hindi,North India,gehun,गेहूँ",
].join("\n");

const CHEMICAL_SAMPLE = [
  "input_chemical,alias,status",
  "Glyphosate,Roundup,Restricted",
  "Glyphosate,Glifos,Restricted",
  "Atrazine,Aatrex,Banned",
].join("\n");

/**
 * "Sample CSV" download button for the AgriTech bulk upload. Only meaningful for
 * crop / chemical (the two types bulk upload supports); returns null otherwise.
 */
export const SampleCsvButton = ({ entryType }: { entryType: string }) => {
  if (entryType !== "crop" && entryType !== "chemical") return null;
  const isChem = entryType === "chemical";

  const download = () => {
    const csv = isChem ? CHEMICAL_SAMPLE : CROP_SAMPLE;
    const filename = isChem ? "chemicals_sample.csv" : "crops_sample.csv";
    // Prepend a BOM so Excel opens the native (Unicode) columns correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={download}
      title="Download a sample CSV with the required columns"
      className="h-8 text-xs gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
    >
      <Download className="h-3.5 w-3.5" />
      Sample CSV
    </Button>
  );
};
