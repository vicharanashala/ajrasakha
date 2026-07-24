import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { useState } from "react";
import { Calendar } from "@/components/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { CalendarIcon, ClipboardCheck, Download, InfoIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/atoms/accordion";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/atoms/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { BreakdownTooltip } from "@/components/atoms/source-breakdown-tooltip";

type ResponseAdherenceTableData = {
  date: string;
  time: string;
  timeWindow: string;
  whatsappQueriesAsked: number;
  ajrasakhaQueriesAsked: number;
  manualQueriesAsked: number;
  whatsappPushedToReviewer: number;
  ajrasakhaPushedToReviewer: number;
  manualPushedToReviewer: number;
  whatsappAnsweredWithin120Min: number;
  ajrasakhaAnsweredWithin120Min: number;
  manualAnsweredWithin120Min: number;
  whatsappMarkedDuplicate: number;
  ajrasakhaMarkedDuplicate: number;
  manualMarkedDuplicate: number;
  whatsappDynamicWeather: number;
  ajrasakhaDynamicWeather: number;
  manualDynamicWeather: number;
  whatsappDynamicMarket: number;
  ajrasakhaDynamicMarket: number;
  manualDynamicMarket: number;
  whatsappDynamicSchemes: number;
  ajrasakhaDynamicSchemes: number;
  manualDynamicSchemes: number;
  // whatsappNonGdbWithin120: number;
  // ajrasakhaNonGdbWithin120: number;
  // manualNonGdbWithin120: number;
  whatsappInReview: number;
  ajrasakhaInReview: number;
  manualInReview: number;
  whatsappOpen: number;
  ajrasakhaOpen: number;
  manualOpen: number;
  whatsappDelayed: number;
  ajrasakhaDelayed: number;
  manualDelayed: number;

            whatsappClosedCount: number;
        whatsappPendingCount: number;
        whatsappNonAgriCount: number;
        whatsappDynamicCount: number;
        whatsappDuplicateCount: number;
        whatsappHoldCount: number;
        whatsappPaeSubmitedCount: number;
        whatsappDynamicCLosedCount: number;
        whatsappReroutedCount: number;
        whatsappPassCount: number;
        whatsappDuplicateClosedCount: number;

      ajrasakhaClosedCount: number;
    ajrasakhaPendingCount: number;
    ajrasakhaNonAgriCount: number;
    ajrasakhaDynamicCount: number;
    ajrasakhaDuplicateCount: number;
    ajrasakhaHoldCount: number;
    ajrasakhaPaeSubmitedCount:number;
    ajrasakhaDynamicCLosedCount: number;
    ajrasakhaReroutedCount: number;
    ajrasakhaPassCount: number;
    ajrasakhaDuplicateClosedCount:number;

      manualClosedCount: number;
    manualPendingCount: number;
    manualNonAgriCount:number;
    manualDynamicCount: number;
    manualDuplicateCount: number;
    manualHoldCount: number;
    manualPaeSubmitedCount:number;
    manualDynamicCLosedCount: number;
    manualReroutedCount: number;
    manualPassCount: number;
    manualDuplicateClosedCount:number;

                  manualAverageResponseGBDMinutes: number;
    manualAverageResponseNonGBDMinutes: number;
    whatsappAverageResponseGBDMinutes:number;
        whatsappAverageResponseNonGBDMinutes:number;
            ajrasakhaAverageResponseGBDMinutes: number;
    ajrasakhaAverageResponseNonGBDMinutes: number;

  whatsappAverageResponseMinutes: number;
  ajrasakhaAverageResponseMinutes: number;
  manualAverageResponseMinutes: number;
  whatsappAdherencePct: number;
  ajrasakhaAdherencePct: number;
  manualAdherencePct: number;
  manualTotal: number;
  agriexpertTotal: number;
  outreachTotal: number;
  answeredWithin120MinClosedwhatsapp: number;
  answeredWithin120MinPasswhatsapp: number;
  answeredWithin120MinDynamicClosedwhatsapp: number;
  answeredWithin120MinDuplicateClosedwhatsapp: number;
  answeredWithin120MinClosedajrasakha: number;
  answeredWithin120MinPassajrasakha: number;
  answeredWithin120MinDynamicClosedajrasakha: number;
  answeredWithin120MinDuplicateClosedajrasakha: number;
  answeredWithin120MinClosedmanual: number;
  answeredWithin120MinPassmanual: number;
  answeredWithin120MinDynamicClosedmanual: number;
  answeredWithin120MinDuplicateClosedmanual: number;

  whatsappdynamicWeatherDynamicCount: number;
  whatsappdynamicWeatherStaticDynamicCount: number;
  ajrasakhadynamicWeatherDynamicCount: number;
  ajrasakhadynamicWeatherStaticDynamicCount: number;
  manualdynamicWeatherDynamicCount: number;
  manualdynamicWeatherStaticDynamicCount: number;

  whatsappdynamicMarketDynamicCount: number;
  whatsappdynamicMarketStaticDynamicCount: number;
  ajrasakhadynamicMarketDynamicCount: number;
  ajrasakhadynamicMarketStaticDynamicCount: number;
  manualdynamicMarketDynamicCount: number;
  manualdynamicMarketStaticDynamicCount: number;

  whatsappdynamicSchemesDynamicCount: number;
  whatsappdynamicSchemesStaticDynamicCount: number;
  ajrasakhadynamicSchemesDynamicCount: number;
  ajrasakhadynamicSchemesStaticDynamicCount: number;
  manualdynamicSchemesDynamicCount: number;
  manualdynamicSchemesStaticDynamicCount: number;

  totalDynamicWhatsappCount: number;
  totalDynamicAjrasakhaCount: number;
  totalDynamicManualCount: number;

  totalStaticDynamicWhatsappCount: number;
  totalStaticDynamicAjrasakhaCount: number;
  totalStaticDynamicManualCount: number;
};

const DEFAULT_DATA: ResponseAdherenceTableData = {
  date: "",
  time: "",
  timeWindow: "",
  whatsappQueriesAsked: 0,
  ajrasakhaQueriesAsked: 0,
  manualQueriesAsked: 0,
  whatsappPushedToReviewer: 0,
  ajrasakhaPushedToReviewer: 0,
  manualPushedToReviewer: 0,
  whatsappAnsweredWithin120Min: 0,
  ajrasakhaAnsweredWithin120Min: 0,
  manualAnsweredWithin120Min: 0,
  whatsappMarkedDuplicate: 0,
  ajrasakhaMarkedDuplicate: 0,
  manualMarkedDuplicate: 0,
  whatsappDynamicWeather: 0,
  ajrasakhaDynamicWeather: 0,
  manualDynamicWeather: 0,
  whatsappDynamicMarket: 0,
  ajrasakhaDynamicMarket: 0,
  manualDynamicMarket: 0,
  whatsappDynamicSchemes: 0,
  ajrasakhaDynamicSchemes: 0,
  manualDynamicSchemes: 0,

            whatsappClosedCount: 0,
        whatsappPendingCount: 0,
        whatsappNonAgriCount: 0,
        whatsappDynamicCount: 0,
        whatsappDuplicateCount: 0,
        whatsappHoldCount: 0,
        whatsappPaeSubmitedCount: 0,
        whatsappDynamicCLosedCount: 0,
        whatsappReroutedCount: 0,
        whatsappPassCount: 0,
        whatsappDuplicateClosedCount: 0,

      ajrasakhaClosedCount: 0,
    ajrasakhaPendingCount: 0,
    ajrasakhaNonAgriCount: 0,
    ajrasakhaDynamicCount: 0,
    ajrasakhaDuplicateCount: 0,
    ajrasakhaHoldCount: 0,
    ajrasakhaPaeSubmitedCount:0,
    ajrasakhaDynamicCLosedCount: 0,
    ajrasakhaReroutedCount: 0,
    ajrasakhaPassCount: 0,
    ajrasakhaDuplicateClosedCount:0,

      manualClosedCount: 0,
    manualPendingCount: 0,
    manualNonAgriCount:0,
    manualDynamicCount: 0,
    manualDuplicateCount: 0,
    manualHoldCount: 0,
    manualPaeSubmitedCount:0,
    manualDynamicCLosedCount: 0,
    manualReroutedCount: 0,
    manualPassCount: 0,
    manualDuplicateClosedCount:0,

                  manualAverageResponseGBDMinutes: 0,
    manualAverageResponseNonGBDMinutes: 0,
    whatsappAverageResponseGBDMinutes:0,
        whatsappAverageResponseNonGBDMinutes: 0,
            ajrasakhaAverageResponseGBDMinutes: 0,
    ajrasakhaAverageResponseNonGBDMinutes: 0,

  // whatsappNonGdbWithin120: 0,
  // ajrasakhaNonGdbWithin120: 0,
  // manualNonGdbWithin120: 0,
  whatsappInReview: 0,
  ajrasakhaInReview: 0,
  manualInReview: 0,
  whatsappOpen: 0,
  ajrasakhaOpen: 0,
  manualOpen: 0,
  whatsappDelayed: 0,
  ajrasakhaDelayed: 0,
  manualDelayed: 0,
  whatsappAverageResponseMinutes: 0,
  ajrasakhaAverageResponseMinutes: 0,
  manualAverageResponseMinutes: 0,
  whatsappAdherencePct: 0,
  ajrasakhaAdherencePct: 0,
  manualAdherencePct: 0,
  manualTotal: 0,
  agriexpertTotal: 0,
  outreachTotal: 0,
  answeredWithin120MinClosedwhatsapp: 0,
  answeredWithin120MinPasswhatsapp: 0,
  answeredWithin120MinDynamicClosedwhatsapp: 0,
  answeredWithin120MinDuplicateClosedwhatsapp: 0,
  answeredWithin120MinClosedajrasakha: 0,
  answeredWithin120MinPassajrasakha: 0,
  answeredWithin120MinDynamicClosedajrasakha: 0,
  answeredWithin120MinDuplicateClosedajrasakha: 0,
  answeredWithin120MinClosedmanual: 0,
  answeredWithin120MinPassmanual: 0,
  answeredWithin120MinDynamicClosedmanual: 0,
  answeredWithin120MinDuplicateClosedmanual: 0,

  whatsappdynamicWeatherDynamicCount: 0,
  whatsappdynamicWeatherStaticDynamicCount: 0,
  ajrasakhadynamicWeatherDynamicCount: 0,
  ajrasakhadynamicWeatherStaticDynamicCount: 0,
  manualdynamicWeatherDynamicCount: 0,
  manualdynamicWeatherStaticDynamicCount: 0,

  whatsappdynamicMarketDynamicCount: 0,
  whatsappdynamicMarketStaticDynamicCount: 0,
  ajrasakhadynamicMarketDynamicCount: 0,
  ajrasakhadynamicMarketStaticDynamicCount: 0,
  manualdynamicMarketDynamicCount: 0,
  manualdynamicMarketStaticDynamicCount: 0,

  whatsappdynamicSchemesDynamicCount: 0,
  whatsappdynamicSchemesStaticDynamicCount: 0,
  ajrasakhadynamicSchemesDynamicCount: 0,
  ajrasakhadynamicSchemesStaticDynamicCount: 0,
  manualdynamicSchemesDynamicCount: 0,
  manualdynamicSchemesStaticDynamicCount: 0,

  totalDynamicWhatsappCount: 0,
  totalDynamicAjrasakhaCount: 0,
  totalDynamicManualCount: 0,

  totalStaticDynamicWhatsappCount: 0,
  totalStaticDynamicAjrasakhaCount: 0,
  totalStaticDynamicManualCount: 0,
};

const ALL_ROW_IDS = [
  "date",
  "time",
  "header",
  "queriesAsked",
  "pushedReviewer",
  "answered120",
  "answered120Closed",
  "answered120Pass",
  "answered120DynamicClosed",
  "answered120DuplicateClosed",
  "duplicate",

  "totalDynamic",
  "dynamicWeather",
  "dynamicMarket",
  "dynamicSchemes",

  "totalStaticDynamic",
  "staticdynamicWeather",
  "staticdynamicMarket",
  "staticdynamicSchemes",
  // "nonGdb",
  "inReview",
  "open",
  "delayed",
  "summaryDelayReason",
  "avgResponse",
  "adherencePct",
] as const;

const DEFAULT_SELECTED_ROW_IDS = new Set<string>([
  "date",
  "time",
  "header",
  "pushedReviewer",
  "answered120",
  "summaryDelayReason",
  "avgResponse",
  "adherencePct",
]);
 
type RowConfig =
  | {
      key: string;
      label: string;
      tooltip?: string;
      type: "single";
      value: React.ReactNode;
      span?: boolean;
    }
  | {
      key: string;
      label: string;
      tooltip?: string;
      type: "header";
      wa: React.ReactNode;
      manual: React.ReactNode;
      as: React.ReactNode;
      isHeader: true;
    }
  | {
      key: string;
      label: string;
      tooltip?: string;
      type: "data";
      wa: React.ReactNode;
      manual: React.ReactNode;
      as: React.ReactNode;
      highlight?: boolean;
    };

const todayAsInputDate = (now: Date = new Date()) => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseInputDateToLocalDate = (value: string): Date => {
  if (!value) return new Date();
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 Min";
  const totalMinutes = Math.round(minutes);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs === 0) return `${mins} Min`;
  if (mins === 0) return `${hrs} Hr`;
  return `${hrs} Hr. ${mins} Mins`;
}

export function ResponseAdherenceTableCard({
  data,
  selectedDate,
  onSelectedDateChange,
  isLoading = false,
  userType,
}: {
  data?: Partial<ResponseAdherenceTableData> | null;
  selectedDate?: string;
  onSelectedDateChange?: (date: string) => void;
  isLoading?: boolean;
  userType: 'all' | 'external' | 'internal';
}) {
  type ExportColumn = "whatsapp" | "ajraSakha" | "manual";
    console.log("data----", data);
  const [checkedColumns, setCheckedColumns] = useState<
    Record<ExportColumn, boolean>
  >({
    whatsapp: true,
    ajraSakha: true,
    manual: false,
  });

  const toggleColumn = (column: ExportColumn) => {
    setCheckedColumns((prev) => ({
      ...prev,
      [column]: !prev[column],
    }));
  };
  const d = { ...DEFAULT_DATA, ...(data ?? {}) };
  const whatsappQueriesAskedDisplay =
    d.whatsappQueriesAsked > 0 ? d.whatsappQueriesAsked : "NIL";
  const manualQueriesAskedDisplay = 
    d.manualQueriesAsked > 0 ? d.manualQueriesAsked : "NIL";
  // const manualDynamicWeatherDisplay =
  //   d.manualDynamicWeather > 0 ? d.manualDynamicWeather : "NIL";
  // const manualDynamicMarketDisplay =
  //   d.manualDynamicMarket > 0 ? d.manualDynamicMarket : "NIL";
  // const manualDynamicSchemesDisplay =
  //   d.manualDynamicSchemes > 0 ? d.manualDynamicSchemes : "NIL";
  const [internalDate, setInternalDate] = useState<string>(todayAsInputDate());
  const [checkedRows, setCheckedRows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      ALL_ROW_IDS.map((rowId) => [rowId, DEFAULT_SELECTED_ROW_IDS.has(rowId)]),
    ),
  );

  const effectiveDate = selectedDate ?? internalDate;

  const toggleRow = (rowId: string) =>
    setCheckedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));

  const handleDateChange = (nextDate: string) => {
    if (onSelectedDateChange) {
      onSelectedDateChange(nextDate);
      return;
    }
    setInternalDate(nextDate);
  };

  const csvEscape = (value: string | number) => {
    const str = String(value ?? "");
    const escaped = str.replace(/"/g, "\"\"");
    return `"${escaped}"`;
  };

  const rowExportData = [
    { id: "date", field: "Date", whatsapp: d.date || effectiveDate || "", ajraSakha: "", manual: "", notes: "" },
    { id: "time", field: "Time", whatsapp: d.timeWindow, ajraSakha: "", manual: "", notes: "" },
    { id: "header", field: "Source", whatsapp: "Whatsapp", ajraSakha: "AjraSakha", manual: "Manual", notes: "" },
    { id: "queriesAsked", field: "Queries Asked", whatsapp: whatsappQueriesAskedDisplay, ajraSakha: d.ajrasakhaQueriesAsked, manual: manualQueriesAskedDisplay, notes: "" },
    { id: "pushedReviewer", field: "Questions pushed into the review system", whatsapp: d.whatsappPushedToReviewer, ajraSakha: d.ajrasakhaPushedToReviewer, manual: d.manualPushedToReviewer, notes: "" },
    { id: "answered120", field: "Questions answered within 120 minutes", whatsapp: d.whatsappAnsweredWithin120Min, ajraSakha: d.ajrasakhaAnsweredWithin120Min, manual: d.manualAnsweredWithin120Min, notes: "" },
    { id: "answered120Closed", field: "Closed within 120 minutes", whatsapp: d.answeredWithin120MinClosedwhatsapp,ajraSakha: d.answeredWithin120MinClosedajrasakha,manual: d.answeredWithin120MinClosedmanual,notes: "",},
    { id: "answered120Pass",field: "Pass within 120 minutes",whatsapp: d.answeredWithin120MinPasswhatsapp,ajraSakha: d.answeredWithin120MinPassajrasakha,manual: d.answeredWithin120MinPassmanual,notes: "",},
    { id: "answered120DynamicClosed",field: "Dynamic Closed within 120 minutes",whatsapp: d.answeredWithin120MinDynamicClosedwhatsapp,ajraSakha: d.answeredWithin120MinDynamicClosedajrasakha,manual: d.answeredWithin120MinDynamicClosedmanual,notes: "",},
    { id: "answered120DuplicateClosed",field: "Duplicate Closed within 120 minutes",whatsapp: d.answeredWithin120MinDuplicateClosedwhatsapp,ajraSakha: d.answeredWithin120MinDuplicateClosedajrasakha,manual: d.answeredWithin120MinDuplicateClosedmanual,notes: "",},
    { id: "duplicate", field: "Marked Duplicate (Fetched from GDB)", whatsapp: d.whatsappMarkedDuplicate, ajraSakha: d.ajrasakhaMarkedDuplicate, manual: d.manualMarkedDuplicate, notes: "" },

    { id: "totalDynamic", field: "Total - Dynamic", whatsapp: d.totalDynamicWhatsappCount, ajraSakha: d.totalDynamicAjrasakhaCount, manual: d.totalDynamicManualCount, notes: "" },
    { id: "dynamicWeather", field: "Dynamic - Weather", whatsapp: d.whatsappdynamicWeatherDynamicCount, ajraSakha: d.ajrasakhadynamicWeatherDynamicCount, manual: d.manualdynamicWeatherDynamicCount, notes: "" },
    { id: "dynamicMarket", field: "Dynamic - Market", whatsapp: d.whatsappdynamicMarketDynamicCount, ajraSakha: d.ajrasakhadynamicMarketDynamicCount, manual:d.manualdynamicMarketDynamicCount, notes: "" },
    { id: "dynamicSchemes", field: "Dynamic - Schemes", whatsapp: d.whatsappdynamicSchemesDynamicCount, ajraSakha: d.ajrasakhadynamicSchemesDynamicCount, manual: d.manualdynamicSchemesDynamicCount, notes: "" },

    { id: "totalStaticDynamic", field: "Total - Static Dynamic", whatsapp: d.totalStaticDynamicWhatsappCount, ajraSakha: d.totalStaticDynamicAjrasakhaCount, manual: d.totalStaticDynamicManualCount, notes: "" },
    { id: "staticdynamicWeather", field: "Static Dynamic - Weather", whatsapp: d.whatsappdynamicWeatherStaticDynamicCount, ajraSakha: d.ajrasakhadynamicWeatherStaticDynamicCount, manual: d.manualdynamicWeatherStaticDynamicCount, notes: "" },
    { id: "staticdynamicMarket", field: "Static Dynamic - Market", whatsapp: d.whatsappdynamicMarketStaticDynamicCount, ajraSakha: d.ajrasakhadynamicMarketStaticDynamicCount, manual:d.manualdynamicMarketStaticDynamicCount, notes: "" },
    { id: "staticdynamicSchemes", field: "Static Dynamic - Schemes", whatsapp: d.whatsappdynamicSchemesStaticDynamicCount, ajraSakha: d.ajrasakhadynamicSchemesStaticDynamicCount, manual: d.manualdynamicSchemesStaticDynamicCount, notes: "" },
    // { id: "nonGdb", field: "Non GDB Questions - Answer prepared in 120 Min by AEs", whatsapp: d.whatsappNonGdbWithin120, ajraSakha: d.ajrasakhaNonGdbWithin120, manual: d.manualNonGdbWithin120, notes: "" },
    { id: "inReview", field: "Question in Review", whatsapp: d.whatsappInReview, ajraSakha: d.ajrasakhaInReview, manual: d.manualInReview, notes: "" },
    { id: "open", field: "Questions are Open", whatsapp: d.whatsappOpen, ajraSakha: d.ajrasakhaOpen, manual: d.manualOpen, notes: "" },
    { id: "delayed", field: "Questions are delayed", whatsapp: d.whatsappDelayed, ajraSakha: d.ajrasakhaDelayed, manual: d.manualDelayed, notes: "" },
    {id: "closed", field: "Question are closed", whatsapp: d.whatsappClosedCount, ajraSakha: d.ajrasakhaClosedCount, manual: d.manualClosedCount, notes:""},
    {id: "pending", field: "Question are pending", whatsapp: d.whatsappPendingCount, ajraSakha: d.ajrasakhaPendingCount, manual: d.manualPendingCount, notes:""},
    {id: "non agri", field: "Question are non-agri", whatsapp: d.whatsappNonAgriCount, ajraSakha: d.ajrasakhaNonAgriCount, manual: d.manualNonAgriCount, notes:""},
    {id: "dynamic", field: "Dynamic Question", whatsapp: d.whatsappDynamicCount, ajraSakha: d.ajrasakhaDynamicCount, manual: d.manualDynamicCount, notes:""},
    {id: "duplicate", field: "Duplicate Question", whatsapp: d.whatsappDuplicateCount, ajraSakha: d.ajrasakhaDuplicateCount, manual: d.manualDuplicateCount, notes:""},
    {id: "hold", field: "Question on hold", whatsapp: d.whatsappHoldCount, ajraSakha: d.ajrasakhaHoldCount, manual: d.manualHoldCount, notes:""},
    {id: "paeSubmited", field: "PAE Submited Questions", whatsapp: d.whatsappPaeSubmitedCount, ajraSakha: d.ajrasakhaPaeSubmitedCount, manual: d.manualPaeSubmitedCount, notes:""},
    {id: "dynamic closed", field: "Dynamic Closed Questions", whatsapp: d.whatsappDynamicCLosedCount, ajraSakha: d.ajrasakhaDynamicCLosedCount, manual: d.manualDynamicCLosedCount, notes:""},
    {id: "rerouted", field: "Rerouted Questions", whatsapp: d.whatsappReroutedCount, ajraSakha: d.ajrasakhaReroutedCount, manual: d.manualReroutedCount, notes:""},
    {id: "pass", field: "Pass Questions", whatsapp: d.whatsappPassCount, ajraSakha: d.ajrasakhaPassCount, manual: d.manualPassCount, notes:""},
    {id: "duplicate closed", field: "Duplicate Closed Questions", whatsapp: d.whatsappDuplicateClosedCount, ajraSakha: d.ajrasakhaDuplicateClosedCount, manual: d.manualDuplicateClosedCount, notes:""},
    { id: "summaryDelayReason", field: "Summary of the reason for delay", whatsapp: "", ajraSakha: "", manual: "", notes: "" },
    { id: "avgResponse", field: "Average response time", whatsapp: formatMinutes(d.whatsappAverageResponseMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseMinutes), manual: formatMinutes(d.manualAverageResponseMinutes), notes: "" },
    { id: "avgResponseGDB", field: "Average response time GDB", whatsapp: formatMinutes(d.whatsappAverageResponseGBDMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseGBDMinutes), manual: formatMinutes(d.manualAverageResponseGBDMinutes), notes: "" },
    { id: "avgResponseNonGDB", field: "Average response time Non GDB", whatsapp: formatMinutes(d.whatsappAverageResponseNonGBDMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseNonGBDMinutes), manual: formatMinutes(d.manualAverageResponseNonGBDMinutes), notes: "" },
    { id: "adherencePct", field: "Percentage of questions completed within 120 minutes", whatsapp: `${d.whatsappAdherencePct.toFixed(2)}%`, ajraSakha: `${d.ajrasakhaAdherencePct.toFixed(2)}%`, manual: `${d.manualAdherencePct.toFixed(2)}%`, notes: "" },
    { id: "slaBreached", field: "SLA Breached", whatsapp: `${(100 - d.whatsappAdherencePct).toFixed(2)}%`, ajraSakha: `${(100 - d.ajrasakhaAdherencePct).toFixed(2)}%`, manual: `${(100 - d.manualAdherencePct).toFixed(2)}%`, notes: "" },
  ] as const;

  const rows: RowConfig[] = [
    {
      key: "date",
      label: "Date",
      tooltip: "Date for which the response adherence metrics are calculated.",
      type: "single",
      value: d.date || effectiveDate,
    },
    {
      key: "time",
      label: "Time Window",
      tooltip:
        "Time range within the selected date used to calculate all metrics in this report.",
      type: "single",
      value: d.timeWindow,
      span: true,
    },
    {
      key: "header",
      label: "Source",
      tooltip:
        "Channel through which the question entered the system: WhatsApp, AjraSakha, or Manual.",
      type: "header",
      wa: "WhatsApp",
      as: "AjraSakha",
      manual: "Manual",
      isHeader: true,
    },

    {
      key: "queriesAsked",
      label: "Queries Asked",
      tooltip:
        "Total user queries received from this source during the selected time window.",
      type: "data",
      wa: whatsappQueriesAskedDisplay,
      as: d.ajrasakhaQueriesAsked,
      manual: manualQueriesAskedDisplay,
    },
    {
      key: "pushedReviewer",
      label: "Pushed into Reviewer System",
      tooltip:
        "Total questions created in the reviewer system for this source during the selected time window.",
      type: "data",
      wa: d.whatsappPushedToReviewer,
      as: d.ajrasakhaPushedToReviewer,
      manual: d.manualPushedToReviewer,
    },

    {
      key: "answered120",
      label: "Responded within 120 min",
      tooltip:
        "Total completed questions whose operational completion time was within 120 minutes of question creation.",
      type: "data",
      wa: d.whatsappAnsweredWithin120Min,
      as: d.ajrasakhaAnsweredWithin120Min,
      manual: d.manualAnsweredWithin120Min,
    },
    {
      key: "answered120Closed",
      label: "Closed within 120 minutes",
      tooltip:
        "Questions with Closed status that were completed within 120 minutes. The value is shown against the total questions responded to within 120 minutes.",
      type: "data",
      wa: `${d.answeredWithin120MinClosedwhatsapp} / ${d.whatsappAnsweredWithin120Min}`,
      as: `${d.answeredWithin120MinClosedajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,
      manual: `${d.answeredWithin120MinClosedmanual} / ${d.manualAnsweredWithin120Min}`,
    },
    {
      key: "answered120Pass",
      label: "Pass within 120 minutes",
      tooltip:
        "Questions with Pass status that were completed within 120 minutes. The value is shown against the total questions responded to within 120 minutes.",
      type: "data",
      wa: `${d.answeredWithin120MinPasswhatsapp} / ${d.whatsappAnsweredWithin120Min}`,
      as: `${d.answeredWithin120MinPassajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,
      manual: `${d.answeredWithin120MinPassmanual} / ${d.manualAnsweredWithin120Min}`,
    },
    {
      key: "answered120DynamicClosed",
      label: "Dynamic Closed within 120 minutes",
      tooltip:
        "Dynamic questions that reached Dynamic Closed status within 120 minutes. The value is shown against the total questions responded to within 120 minutes.",
      type: "data",
      wa: `${d.answeredWithin120MinDynamicClosedwhatsapp} / ${d.whatsappAnsweredWithin120Min}`,
      as: `${d.answeredWithin120MinDynamicClosedajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,
      manual: `${d.answeredWithin120MinDynamicClosedmanual} / ${d.manualAnsweredWithin120Min}`,
    },
    {
      key: "answered120DuplicateClosed",
      label: "Duplicate Closed within 120 minutes",
      tooltip:
        "Duplicate questions that reached Duplicate Closed status within 120 minutes. The value is shown against the total questions responded to within 120 minutes.",
      type: "data",
      wa: `${d.answeredWithin120MinDuplicateClosedwhatsapp} / ${d.whatsappAnsweredWithin120Min}`,
      as: `${d.answeredWithin120MinDuplicateClosedajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,
      manual: `${d.answeredWithin120MinDuplicateClosedmanual} / ${d.manualAnsweredWithin120Min}`,
    },

    {
      key: "duplicate",
      label: "Marked Duplicate (GDB)",
      tooltip:
        "Questions identified as duplicates of an existing Golden Database (GDB) question.",
      type: "data",
      wa: d.whatsappMarkedDuplicate,
      as: d.ajrasakhaMarkedDuplicate,
      manual: d.manualMarkedDuplicate,
    },

    {
      key: "totalDynamic",
      label: "Total - Dynamic",
      tooltip:
        "Total dynamic Weather, Market, and Schemes questions. These are handled through dynamic data or tool-based processing.",
      type: "data",
      wa: d.totalDynamicWhatsappCount,
      as: d.totalDynamicAjrasakhaCount,
      manual: d.totalDynamicManualCount,
    },
    {
      key: "dynamicWeather",
      label: "Dynamic — Weather",
      tooltip:
        "Weather-related questions classified as Dynamic.",
      type: "data",
      wa: d.whatsappdynamicWeatherDynamicCount,
      as: d.ajrasakhadynamicWeatherDynamicCount,
      manual: d.manualdynamicWeatherDynamicCount,
    },
    {
      key: "dynamicMarket",
      label: "Dynamic — Market",
      tooltip:
        "Market-related questions classified as Dynamic.",
      type: "data",
      wa: d.whatsappdynamicMarketDynamicCount,
      as: d.ajrasakhadynamicMarketDynamicCount,
      manual: d.manualdynamicMarketDynamicCount,
    },
    {
      key: "dynamicSchemes",
      label: "Dynamic — Schemes",
      tooltip:
        "Government scheme-related questions classified as Dynamic.",
      type: "data",
      wa: d.whatsappdynamicSchemesDynamicCount,
      as: d.ajrasakhadynamicSchemesDynamicCount,
      manual: d.manualdynamicSchemesDynamicCount,
    },

    {
      key: "totalStaticDynamic",
      label: "Total - Static Dynamic",
      tooltip:
        "Total Weather, Market, and Schemes questions tagged as Static Dynamic.",
      type: "data",
      wa: d.totalStaticDynamicWhatsappCount,
      as: d.totalStaticDynamicAjrasakhaCount,
      manual: d.totalStaticDynamicManualCount,
    },
    {
      key: "staticdynamicWeather",
      label: "Static Dynamic — Weather",
      tooltip:
        "Weather-related questions tagged as Static Dynamic.",
      type: "data",
      wa: d.whatsappdynamicWeatherStaticDynamicCount,
      as: d.ajrasakhadynamicWeatherStaticDynamicCount,
      manual: d.manualdynamicWeatherStaticDynamicCount,
    },
    {
      key: "staticdynamicMarket",
      label: "Static Dynamic — Market",
      tooltip:
        "Market-related questions tagged as Static Dynamic.",
      type: "data",
      wa: d.whatsappdynamicMarketStaticDynamicCount,
      as: d.ajrasakhadynamicMarketStaticDynamicCount,
      manual: d.manualdynamicMarketStaticDynamicCount,
    },
    {
      key: "staticdynamicSchemes",
      label: "Static Dynamic — Schemes",
      tooltip:
        "Government scheme-related questions tagged as Static Dynamic.",
      type: "data",
      wa: d.whatsappdynamicSchemesStaticDynamicCount,
      as: d.ajrasakhadynamicSchemesStaticDynamicCount,
      manual: d.manualdynamicSchemesStaticDynamicCount,
    },

    {
      key: "inReview",
      label: "In Review",
      tooltip:
        "Questions currently under review and awaiting completion of the review process.",
      type: "data",
      wa: d.whatsappInReview,
      as: d.ajrasakhaInReview,
      manual: d.manualInReview,
    },
    {
      key: "open",
      label: "Open",
      tooltip:
        "Questions currently in Open status and not yet completed.",
      type: "data",
      wa: d.whatsappOpen,
      as: d.ajrasakhaOpen,
      manual: d.manualOpen,
    },
    {
      key: "delayed",
      label: "Delayed",
      tooltip:
        "Questions currently marked as Delayed in the reviewer system.",
      type: "data",
      wa: d.whatsappDelayed,
      as: d.ajrasakhaDelayed,
      manual: d.manualDelayed,
    },
    {
      key: "closed",
      label: "Closed",
      tooltip:
        "Questions whose current reviewer-system status is Closed.",
      type: "data",
      wa: d.whatsappClosedCount,
      as: d.ajrasakhaClosedCount,
      manual: d.manualClosedCount,
    },
    {
      key: "pending",
      label: "Pending",
      tooltip:
        "Questions whose current reviewer-system status is Pending.",
      type: "data",
      wa: d.whatsappPendingCount,
      as: d.ajrasakhaPendingCount,
      manual: d.manualPendingCount,
    },
    {
      key: "nonAgri",
      label: "Non Agri",
      tooltip:
        "Questions classified as non-agricultural and therefore outside the agricultural query workflow.",
      type: "data",
      wa: d.whatsappNonAgriCount,
      as: d.ajrasakhaNonAgriCount,
      manual: d.manualNonAgriCount,
    },
    {
      key: "dynamic",
      label: "Dynamic",
      tooltip:
        "Questions whose current reviewer-system status is Dynamic.",
      type: "data",
      wa: d.whatsappDynamicCount,
      as: d.ajrasakhaDynamicCount,
      manual: d.manualDynamicCount,
    },
    {
      key: "duplicate",
      label: "Duplicate",
      tooltip:
        "Questions whose current reviewer-system status is Duplicate.",
      type: "data",
      wa: d.whatsappDuplicateCount,
      as: d.ajrasakhaDuplicateCount,
      manual: d.manualDuplicateCount,
    },
    {
      key: "hold",
      label: "Hold",
      tooltip:
        "Questions currently placed on hold and awaiting further action.",
      type: "data",
      wa: d.whatsappHoldCount,
      as: d.ajrasakhaHoldCount,
      manual: d.manualHoldCount,
    },
    {
      key: "paeSubmited",
      label: "PAE Submitted",
      tooltip:
        "Questions whose current status indicates that they have been submitted to the PAE workflow.",
      type: "data",
      wa: d.whatsappPaeSubmitedCount,
      as: d.ajrasakhaPaeSubmitedCount,
      manual: d.manualPaeSubmitedCount,
    },
    {
      key: "dynamicClosed",
      label: "Dynamic Closed",
      tooltip:
        "Dynamic questions that have completed processing and reached Dynamic Closed status.",
      type: "data",
      wa: d.whatsappDynamicCLosedCount,
      as: d.ajrasakhaDynamicCLosedCount,
      manual: d.manualDynamicCLosedCount,
    },
    {
      key: "rerouted",
      label: "Rerouted",
      tooltip:
        "Questions rerouted to another workflow or processing path.",
      type: "data",
      wa: d.whatsappReroutedCount,
      as: d.ajrasakhaReroutedCount,
      manual: d.manualReroutedCount,
    },
    {
      key: "pass",
      label: "Pass",
      tooltip:
        "Questions whose current reviewer-system status is Pass.",
      type: "data",
      wa: d.whatsappPassCount,
      as: d.ajrasakhaPassCount,
      manual: d.manualPassCount,
    },
    {
      key: "duplicateClosed",
      label: "Duplicate Closed",
      tooltip:
        "Duplicate questions whose processing has been completed and whose current status is Duplicate Closed.",
      type: "data",
      wa: d.whatsappDuplicateClosedCount,
      as: d.ajrasakhaDuplicateClosedCount,
      manual: d.manualDuplicateClosedCount,
    },

    {
      key: "summaryDelayReason",
      label: "Summary of delay reason",
      tooltip:
        "Summary explaining why questions exceeded the expected response or processing time.",
      type: "data",
      wa: "—",
      as: "—",
      manual: "—",
    },

    {
      key: "avgResponse",
      label: "Avg. Response Time",
      tooltip:
        "Average time from question creation to operational completion across all completed question categories.",
      type: "data",
      wa: formatMinutes(d.whatsappAverageResponseMinutes),
      as: formatMinutes(d.ajrasakhaAverageResponseMinutes),
      manual: formatMinutes(d.manualAverageResponseMinutes),
    },
    {
      key: "avgResponseGDB",
      label: "Avg. Response Time of GDB",
      tooltip:
        "Average time from question creation to closure for GDB-based questions.",
      type: "data",
      wa: formatMinutes(d.whatsappAverageResponseGBDMinutes),
      as: formatMinutes(d.ajrasakhaAverageResponseGBDMinutes),
      manual: formatMinutes(d.manualAverageResponseGBDMinutes),
    },
    {
      key: "avgResponseNonGDB",
      label: "Avg. Response Time of Non GDB",
      tooltip:
        "Average time from question creation to operational completion for Non-GDB questions, including Pass, Dynamic Closed, and Duplicate Closed.",
      type: "data",
      wa: formatMinutes(d.whatsappAverageResponseNonGBDMinutes),
      as: formatMinutes(d.ajrasakhaAverageResponseNonGBDMinutes),
      manual: formatMinutes(d.manualAverageResponseNonGBDMinutes),
    },
    {
      key: "slaBreached",
      label: "SLA Breached",
      tooltip:
        "Percentage of completed questions that were not completed within the 120-minute SLA. Calculated as 100% minus the 120-minute adherence percentage.",
      type: "data",
      wa:
        d.whatsappAdherencePct != null
          ? `${(100 - d.whatsappAdherencePct).toFixed(2)}%`
          : "—",
      as:
        d.ajrasakhaAdherencePct != null
          ? `${(100 - d.ajrasakhaAdherencePct).toFixed(2)}%`
          : "—",
      manual:
        d.manualAdherencePct != null
          ? `${(100 - d.manualAdherencePct).toFixed(2)}%`
          : "—",
      highlight: false,
    },
    {
      key: "adherencePct",
      label: "% Responded within 120 min",
      tooltip:
        "Percentage of completed questions that were operationally completed within 120 minutes of creation.",
      type: "data",
      wa:
        d.whatsappAdherencePct != null
          ? `${d.whatsappAdherencePct.toFixed(2)}%`
          : "—",
      as:
        d.ajrasakhaAdherencePct != null
          ? `${d.ajrasakhaAdherencePct.toFixed(2)}%`
          : "—",
      manual:
        d.manualAdherencePct != null
          ? `${d.manualAdherencePct.toFixed(2)}%`
          : "—",
      highlight: true,
    },
  ];


  const hasSelectedRows = rowExportData.some((row) => checkedRows[row.id]);

  const handleDownloadSelectedFields = () => {
    const selectedRows = rowExportData.filter((row) => checkedRows[row.id]);
    if (!selectedRows.length) return;

    const header = ["Field"];
    if (checkedColumns.whatsapp) {
      header.push("Whatsapp");
    }
    if (checkedColumns.ajraSakha) {
      header.push("AjraSakha");
    }
    if (checkedColumns.manual) {
      header.push("Manual");
    }
    header.push("Notes");

    const lines = selectedRows.map((row) => {
      const values: (string | number)[] = [row.field];

      if (checkedColumns.whatsapp) {
        values.push(row.whatsapp);
      }

      if (checkedColumns.ajraSakha) {
        values.push(row.ajraSakha);
      }

      if (checkedColumns.manual) {
        values.push(row.manual);
      }

      values.push(row.notes);

      return values
        .map((value) => csvEscape(value))
        .join(",");
    });

    const csvContent = ["\uFEFF" + header.join(","), ...lines].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    const now = new Date();
    const timestamp = `${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
    anchor.download = `response-adherence-report-${effectiveDate}-${timestamp}.csv`;    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  };

  const rowCheck = (rowId: string) => (
    <input
      type="checkbox"
      checked={!!checkedRows[rowId]}
      onChange={() => toggleRow(rowId)}
      className="h-5 w-5 cursor-pointer accent-primary"
    />
  );
  const queryClient = useQueryClient();
  const handleRefresh = async ()=>{
    await queryClient.refetchQueries({ queryKey: ["response-adherence-table"] });
  }

  return (
    // <Card className="mb-4 rounded-2xl border border-border/60 bg-muted/5 shadow-none">
    //   <Accordion type="single" collapsible>
    //     <AccordionItem value="response-adherence" className="border-none">
    //       {/* ── Card Header ── */}
    //       <CardHeader className="p-0">
    //         <AccordionTrigger className="w-full px-6 py-2.5 hover:no-underline">
    //           <div className="flex w-full items-center justify-between gap-4">
    //             {/* Left */}
    //             <div className="flex items-center gap-2 min-w-0">
    //               <ClipboardCheck className="w-4.5 h-4.5 text-primary shrink-0" />

    //               <CardTitle className="text-base font-semibold tracking-tight text-foreground">
    //                 Response Adherence Summary
    //               </CardTitle>
    //             </div>

    //             {/* Right Section */}
    //             <div
    //               className="flex items-center gap-2 ml-auto mr-3"
    //               onClick={(e) => e.stopPropagation()}
    //             >
    //               {/* Date Picker */}
    //               <Popover>
    //                 <PopoverTrigger asChild>
    //                   <Button
    //                     variant="outline"
    //                     className="h-9 min-w-[200px] justify-start text-sm font-normal border-border/70 bg-background"
    //                   >
    //                     <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />

    //                     {format(
    //                       parseInputDateToLocalDate(effectiveDate),
    //                       "MMM dd, yyyy",
    //                     )}
    //                   </Button>
    //                 </PopoverTrigger>

    //                 <PopoverContent className="w-auto p-0" align="end">
    //                   <Calendar
    //                     initialFocus
    //                     mode="single"
    //                     selected={parseInputDateToLocalDate(effectiveDate)}
    //                     onSelect={(date) => {
    //                       if (!date) return;
    //                       handleDateChange(todayAsInputDate(date));
    //                     }}
    //                     disabled={{ after: new Date() }}
    //                   />
    //                 </PopoverContent>
    //               </Popover>

    //               {/* Download */}
    //               <Button
    //                 type="button"
    //                 variant="outline"
    //                 size="sm"
    //                 onClick={handleDownloadSelectedFields}
    //                 disabled={!hasSelectedRows}
    //                 className="h-9 px-4 text-sm gap-2 border-border/70"
    //               >
    //                 <Download className="w-3.5 h-3.5" />
    //                 Download .xlsx
    //               </Button>
    //             </div>
    //           </div>
    //         </AccordionTrigger>
    //       </CardHeader>

    //       {/* ── Accordion Content ── */}
    //       <AccordionContent>
    //         <CardContent className="pt-0">
    //           {isLoading && (
    //             <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
    //               <Loader2 className="h-3 w-3 animate-spin" />
    //               Fetching data for selected date…
    //             </div>
    //           )}

    //           <div className="overflow-x-auto rounded-xl border border-border/50">
    //             <table className="w-full min-w-[720px] border-collapse text-sm">
    //               <tbody>
    //                 {rows.map((row) => {
    //                   if (row.type === "single") {
    //                     return (
    //                       <tr
    //                         key={row.key}
    //                         className="hover:bg-muted/20 transition-colors"
    //                       >
    //                         <td className="border-b border-r border-border/40 px-2 py-2.5 text-center w-10">
    //                           {rowCheck(row.key)}
    //                         </td>
    //                         <td className="border-b border-r border-border/40 px-3 py-2.5 text-muted-foreground w-56">
    //                           {row.label}
    //                         </td>
    //                         <td
    //                           colSpan={row.span ? 2 : 1}
    //                           className="border-b border-border/40 px-3 py-2.5 font-medium"
    //                         >
    //                           {row.value}
    //                         </td>
    //                         {!row.span && (
    //                           <td className="border-b border-border/40" />
    //                         )}
    //                       </tr>
    //                     );
    //                   }

    //                   if (row.type === "header") {
    //                     return (
    //                       <tr key={row.key} className="bg-muted/30">
    //                         <td className="border-b border-r border-border/40 px-2 py-2.5 text-center w-10">
    //                           {rowCheck(row.key)}
    //                         </td>
    //                         <td className="border-b border-r border-border/40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    //                           {row.label}
    //                         </td>
    //                         <td className="border-b border-r border-border/40 px-3 py-2.5 font-semibold text-foreground">
    //                           {row.wa}
    //                         </td>
    //                         <td className="border-b border-border/40 px-3 py-2.5 font-semibold text-foreground">
    //                           {row.as}
    //                         </td>
    //                       </tr>
    //                     );
    //                   }

    //                   // data row
    //                   return (
    //                     <tr
    //                       key={row.key}
    //                       className={`hover:bg-muted/20 transition-colors ${
    //                         row.highlight ? "bg-primary/5 font-medium" : ""
    //                       }`}
    //                     >
    //                       <td className="border-b border-r border-border/40 px-2 py-2.5 text-center w-10">
    //                         {rowCheck(row.key)}
    //                       </td>
    //                       <td className="border-b border-r border-border/40 px-3 py-2.5 text-muted-foreground">
    //                         {row.label}
    //                       </td>
    //                       <td className="border-b border-r border-border/40 px-3 py-2.5 tabular-nums">
    //                         {row.wa ?? "—"}
    //                       </td>
    //                       <td className="border-b border-border/40 px-3 py-2.5 tabular-nums">
    //                         {row.as ?? "—"}
    //                       </td>
    //                     </tr>
    //                   );
    //                 })}
    //               </tbody>
    //             </table>
    //           </div>
    //         </CardContent>
    //       </AccordionContent>
    //     </AccordionItem>
    //   </Accordion>
    // </Card>

    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card
        className="group mb-4 overflow-hidden rounded-2xl border border-border/60  bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     
"
      >
        <button
            onClick={handleRefresh}
            className="absolute top-10 right-113 z-50 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
            title="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5  ${
                isLoading ? "animate-spin" : ""
              }`}
            />
        </button>
        <Accordion type="single" collapsible>
          <AccordionItem value="response-adherence" className="border-none">
            {/* ── Card Header ── */}
            <CardHeader className="p-0">
              <AccordionTrigger className="w-full px-6 py-3 hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/40">
                <div className="flex w-full items-center justify-between gap-4">
                  {/* Left */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <motion.div
                      whileHover={{ scale: 1.08, rotate: -3 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 15,
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20"
                    >
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                    </motion.div>
                    <div className="flex flex-col items-start min-w-0">
                      <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                        <span>Response Adherence Summary</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                              <InfoIcon className="h-3.5 w-3.5" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Daily response time and completion rate metrics for questions resolved within 120 minutes.
                          </TooltipContent>
                        </Tooltip>
                      </CardTitle>
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Daily breakdown
                      </span>
                    </div>
                  </div>

                  {/* Right Section */}
                  <div
                    className="flex items-center gap-2 ml-auto mr-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Date Picker */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <motion.div
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <Button
                            variant="outline"
                            className="h-9 min-w-[200px] justify-start text-sm font-normal border-border/70 bg-background/80 backdrop-blur-sm shadow-sm hover:bg-muted/40"
                          >
                            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                            {format(
                              parseInputDateToLocalDate(effectiveDate),
                              "MMM dd, yyyy",
                            )}
                          </Button>
                        </motion.div>
                      </PopoverTrigger>

                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          initialFocus
                          mode="single"
                          selected={parseInputDateToLocalDate(effectiveDate)}
                          onSelect={(date) => {
                            if (!date) return;
                            handleDateChange(todayAsInputDate(date));
                          }}
                          disabled={{ after: new Date() }}
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>

                    {/* Download */}
                    <motion.div
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadSelectedFields}
                        disabled={!hasSelectedRows}
                        className="h-9 px-4 text-sm gap-2 border-border/70 bg-background/80 shadow-sm hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                      >
                        <motion.span
                          animate={hasSelectedRows ? { y: [0, -2, 0] } : {}}
                          transition={{
                            repeat: Infinity,
                            repeatDelay: 2,
                            duration: 0.8,
                          }}
                          className="inline-flex"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </motion.span>
                        Download .xlsx
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </AccordionTrigger>
            </CardHeader>

            {/* ── Accordion Content ── */}
            <AccordionContent>
              <CardContent className="pt-4">
                <AnimatePresence>
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 mb-3 text-xs text-muted-foreground overflow-hidden"
                    >
                      <Skeleton className="h-4 w-56 rounded-md" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                  className="overflow-x-auto rounded-xl border border-border/50 shadow-sm"
                >
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <tbody>
                      {rows.map((row, idx) => {
                        const baseMotion = {
                          initial: { opacity: 0, x: -8 },
                          animate: { opacity: 1, x: 0 },
                          transition: {
                            duration: 0.25,
                            delay: idx * 0.03,
                            ease: "easeOut" as const,
                          },
                        };

                        if (row.type === "single") {
                          return (
                            <motion.tr
                              key={row.key}
                              {...baseMotion}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <td className="border-b border-r border-border/40 px-2 py-2.5 text-center w-10">
                                {rowCheck(row.key)}
                              </td>
                              <td className="border-b border-r border-border/40 px-3 py-2.5 text-muted-foreground w-56">
                                {row.label}
                              </td>
                              <td
                                colSpan={row.span ? 3 : 2}
                                className="border-b border-border/40 px-3 py-2.5 font-medium tabular-nums"
                              >
                                {row.value}
                              </td>
                              {!row.span && (
                                <td className="border-b border-border/40" />
                              )}
                            </motion.tr>
                          );
                        }

                        if (row.type === "header") {
                          return (
                            <motion.tr
                              key={row.key}
                              {...baseMotion}
                              className="bg-muted/40"
                            >
                              <td className="border-b border-r border-border/40 px-2 py-2.5 text-center w-10">
                                {rowCheck(row.key)}
                              </td>
                              <td className="border-b border-r border-border/40 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                {row.label}
                              </td>
                              <td className="border-b border-r border-border/40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checkedColumns.whatsapp}
                                    onChange={() => toggleColumn("whatsapp")}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                  />
                                {row.wa}
                                </div>
                              </td>
                              <td className="border-b border-r border-border/40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground">
                                <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checkedColumns.ajraSakha}
                                  onChange={() => toggleColumn("ajraSakha")}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 cursor-pointer accent-primary"
                                />
                                {row.as}
                                </div>
                              </td>
                              <td className="border-b border-r border-border/40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground">  
                                <span className="flex gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checkedColumns.manual}
                                    onChange={() => toggleColumn("manual")}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                  />
                                  {row.manual}
                                  <span className="flex items-center gap-1 ml-2">
                                    <BreakdownTooltip
                                      items={[
                                        {
                                          label: "Manual",
                                          count: data?.manualTotal ?? 0,
                                          key: "MANUAL",
                                        },
                                        {
                                          label: "Agri Expert",
                                          count: data?.agriexpertTotal ?? 0,
                                          key: "AGRI_EXPERT",
                                        },
                                        {
                                          label: "Outreach",
                                          count: data?.outreachTotal ?? 0,
                                          key: "OUTREACH",
                                        },
                                      ]}
                                      effectiveDate = {effectiveDate}
                                      userType={userType}
                                  />
                                </span>
                                </span>
                              </td>
                            </motion.tr>
                          );
                        }

                        return (
                          <motion.tr
                            key={row.key}
                            {...baseMotion}
                            className={`hover:bg-muted/30 transition-colors ${
                              row.highlight
                                ? "bg-primary/5 font-medium ring-1 ring-inset ring-primary/10"
                                : ""
                            }`}
                          >
                            <td className="border-b border-r border-border/40 px-2 py-2.5 text-center w-10">
                              {rowCheck(row.key)}
                            </td>
                            <td className="border-b border-r border-border/40 px-3 py-2.5 text-muted-foreground w-[300px] min-w-[300px]">
                              <div className="flex w-full items-center justify-between gap-3">
                                <span>{row.label}</span>

                                {row.tooltip && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <InfoIcon className="h-4 w-4" />
                                      </button>
                                    </TooltipTrigger>

                                    <TooltipContent
                                      side="top"
                                      className="max-w-xs text-sm"
                                    >
                                      <p>{row.tooltip}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                            <td className="border-b border-r border-border/40 px-3 py-2.5 tabular-nums">
                              {row.wa ?? "—"}
                            </td>
                            <td className="border-b border-border/40 px-3 py-2.5 tabular-nums">
                              {row.as ?? "—"}
                            </td>
                            <td className="border-b border-l border-border/40 px-3 py-2.5 tabular-nums">
                              {row.manual ?? "—"}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </motion.div>
              </CardContent>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </motion.div>
  );
}
