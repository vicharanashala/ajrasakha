import { Button } from "@/components/atoms/button";
import { Download } from "lucide-react";

// Headers match the bulk-upload parsers (case-insensitive). Multiple rows sharing the
// same Crop Name / input_chemical = multiple aliases for that entry. English Name /
// Native Name may hold MULTIPLE names separated by commas — wrap such a cell in quotes
// so the comma isn't read as a column break (e.g. "vari,paddy").
const CROP_SAMPLE = [
  "Crop Name,Scientific Name,Language,Region,English Name,Native Name",
  "Rice,Oryza sativa,Hindi,North India,dhan,धान",
  'Rice,Oryza sativa,Telugu,Andhra and Telangana,"vari,paddy","వరి,పడ్డి"',
  "Wheat,Triticum aestivum,Hindi,North India,gehun,गेहूँ",
].join("\n");

// Weed / pest / disease share the crop structure. "Scientific Name" is optional; the
// "Name" header also works for crops (the parser accepts both "Crop Name" and "Name").
const OTHER_SAMPLE = [
  "Name,Scientific Name,Language,Region,English Name,Native Name",
  "Parthenium,Parthenium hysterophorus,Hindi,North India,gajar ghas,गाजर घास",
  "Nut Grass,Cyperus rotundus,Hindi,North India,motha,मोथा",
].join("\n");

// The `alias` cell may hold multiple trade names separated by commas — wrap it in quotes
// so the comma isn't read as a column break (e.g. "Roundup,Glifos").
const CHEMICAL_SAMPLE = [
  "input_chemical,alias,status",
  'Glyphosate,"Roundup,Glifos",Restricted',
  "Atrazine,Aatrex,Banned",
].join("\n");

/**
 * "Sample CSV" download button for the AgriTech bulk upload. Only meaningful for
 * crop / chemical (the two types bulk upload supports); returns null otherwise.
 */
export const SampleCsvButton = ({ entryType }: { entryType: string }) => {
  const isChem = entryType === "chemical";
  // Crop-side categories (weed/pest/disease) use the generic "Name" template.
  const isOther = !isChem && entryType !== "crop";

  const download = () => {
    const csv = isChem ? CHEMICAL_SAMPLE : isOther ? OTHER_SAMPLE : CROP_SAMPLE;
    const filename = isChem
      ? "chemicals_sample.csv"
      : isOther
        ? `${entryType}_sample.csv`
        : "crops_sample.csv";
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
