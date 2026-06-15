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

type ResponseAdherenceTableData = {
  date: string;
  time: string;
  timeWindow: string;
  whatsappQueriesAsked: number;
  ajrasakhaQueriesAsked: number;
  whatsappPushedToReviewer: number;
  ajrasakhaPushedToReviewer: number;
  whatsappAnsweredWithin120Min: number;
  ajrasakhaAnsweredWithin120Min: number;
  whatsappPassedQuestions: number;
  ajrasakhaPassedQuestions: number;
  whatsappMarkedDuplicate: number;
  ajrasakhaMarkedDuplicate: number;
  whatsappDynamicWeather: number;
  ajrasakhaDynamicWeather: number;
  whatsappDynamicMarket: number;
  ajrasakhaDynamicMarket: number;
  whatsappDynamicSchemes: number;
  ajrasakhaDynamicSchemes: number;
  whatsappNonGdbWithin120: number;
  ajrasakhaNonGdbWithin120: number;
  whatsappInReview: number;
  ajrasakhaInReview: number;
  whatsappOpen: number;
  ajrasakhaOpen: number;
  whatsappDelayed: number;
  ajrasakhaDelayed: number;
  whatsappAverageResponseMinutes: number;
  ajrasakhaAverageResponseMinutes: number;
  whatsappAdherencePct: number;
  ajrasakhaAdherencePct: number;
};

const DEFAULT_DATA: ResponseAdherenceTableData = {
  date: "",
  time: "",
  timeWindow: "",
  whatsappQueriesAsked: 0,
  ajrasakhaQueriesAsked: 0,
  whatsappPushedToReviewer: 0,
  ajrasakhaPushedToReviewer: 0,
  whatsappAnsweredWithin120Min: 0,
  ajrasakhaAnsweredWithin120Min: 0,
  whatsappPassedQuestions: 0,
  ajrasakhaPassedQuestions: 0,
  whatsappMarkedDuplicate: 0,
  ajrasakhaMarkedDuplicate: 0,
  whatsappDynamicWeather: 0,
  ajrasakhaDynamicWeather: 0,
  whatsappDynamicMarket: 0,
  ajrasakhaDynamicMarket: 0,
  whatsappDynamicSchemes: 0,
  ajrasakhaDynamicSchemes: 0,
  whatsappNonGdbWithin120: 0,
  ajrasakhaNonGdbWithin120: 0,
  whatsappInReview: 0,
  ajrasakhaInReview: 0,
  whatsappOpen: 0,
  ajrasakhaOpen: 0,
  whatsappDelayed: 0,
  ajrasakhaDelayed: 0,
  whatsappAverageResponseMinutes: 0,
  ajrasakhaAverageResponseMinutes: 0,
  whatsappAdherencePct: 0,
  ajrasakhaAdherencePct: 0,
};

const ALL_ROW_IDS = [
  "date",
  "time",
  "header",
  "queriesAsked",
  "pushedReviewer",
  "answered120",
  "passedQuestions",
  "duplicate",
  "dynamicWeather",
  "dynamicMarket",
  "dynamicSchemes",
  "nonGdb",
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
  "passedQuestions",
  "summaryDelayReason",
  "avgResponse",
  "adherencePct",
]);
 
type RowConfig =
  | {
      key: string;
      label: string;
      type: "single";
      value: React.ReactNode;
      span?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "header";
      wa: React.ReactNode;
      as: React.ReactNode;
      isHeader: true;
    }
  | {
      key: string;
      label: string;
      type: "data";
      wa: React.ReactNode;
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
}: {
  data?: Partial<ResponseAdherenceTableData> | null;
  selectedDate?: string;
  onSelectedDateChange?: (date: string) => void;
  isLoading?: boolean;
}) {
  const d = { ...DEFAULT_DATA, ...(data ?? {}) };
  const whatsappQueriesAskedDisplay =
    d.whatsappQueriesAsked > 0 ? d.whatsappQueriesAsked : "NIL";
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
    { id: "date", field: "Date", whatsapp: d.date || effectiveDate || "", ajraSakha: "", notes: "" },
    { id: "time", field: "Time", whatsapp: d.timeWindow, ajraSakha: "", notes: "" },
    { id: "header", field: "Source", whatsapp: "Whatsapp", ajraSakha: "AjraSakha", notes: "" },
    { id: "queriesAsked", field: "Queries Asked", whatsapp: whatsappQueriesAskedDisplay, ajraSakha: d.ajrasakhaQueriesAsked, notes: "" },
    { id: "pushedReviewer", field: "Questions pushed into the review system", whatsapp: d.whatsappPushedToReviewer, ajraSakha: d.ajrasakhaPushedToReviewer, notes: "" },
    { id: "answered120", field: "Questions completed within 120 minutes", whatsapp: d.whatsappAnsweredWithin120Min, ajraSakha: d.ajrasakhaAnsweredWithin120Min, notes: "" },
    { id: "passedQuestions", field: "Passed questions count", whatsapp: d.whatsappPassedQuestions, ajraSakha: d.ajrasakhaPassedQuestions, notes: "" },
    { id: "duplicate", field: "Marked Duplicate (Fetched from GDB)", whatsapp: d.whatsappMarkedDuplicate, ajraSakha: d.ajrasakhaMarkedDuplicate, notes: "" },
    { id: "dynamicWeather", field: "Dynamic - Weather", whatsapp: d.whatsappDynamicWeather, ajraSakha: d.ajrasakhaDynamicWeather, notes: "" },
    { id: "dynamicMarket", field: "Dynamic - Market", whatsapp: d.whatsappDynamicMarket, ajraSakha: d.ajrasakhaDynamicMarket, notes: "" },
    { id: "dynamicSchemes", field: "Dynamic - Schemes", whatsapp: d.whatsappDynamicSchemes, ajraSakha: d.ajrasakhaDynamicSchemes, notes: "" },
    { id: "nonGdb", field: "Non GDB Questions - Answer prepared in 120 Min by AEs", whatsapp: d.whatsappNonGdbWithin120, ajraSakha: d.ajrasakhaNonGdbWithin120, notes: "" },
    { id: "inReview", field: "Question in Review", whatsapp: d.whatsappInReview, ajraSakha: d.ajrasakhaInReview, notes: "" },
    { id: "open", field: "Questions are Open", whatsapp: d.whatsappOpen, ajraSakha: d.ajrasakhaOpen, notes: "" },
    { id: "delayed", field: "Questions are delayed", whatsapp: d.whatsappDelayed, ajraSakha: d.ajrasakhaDelayed, notes: "" },
    { id: "summaryDelayReason", field: "Summary of the reason for delay", whatsapp: "", ajraSakha: "", notes: "" },
    { id: "avgResponse", field: "Average response time", whatsapp: formatMinutes(d.whatsappAverageResponseMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseMinutes), notes: "" },
    { id: "adherencePct", field: "Percentage of questions completed within 120 minutes", whatsapp: `${d.whatsappAdherencePct.toFixed(2)}%`, ajraSakha: `${d.ajrasakhaAdherencePct.toFixed(2)}%`, notes: "" },
  ] as const;

   const rows: RowConfig[] = [
     {
       key: "date",
       label: "Date",
       type: "single",
       value: d.date || effectiveDate,
     },
     {
       key: "time",
       label: "Time Window",
       type: "single",
       value: d.timeWindow,
       span: true,
     },
     {
       key: "header",
       label: "Source",
       type: "header",
       wa: "WhatsApp",
       as: "AjraSakha",
       isHeader: true,
     },
     {
       key: "queriesAsked",
       label: "Queries Asked",
       type: "data",
       wa: whatsappQueriesAskedDisplay,
       as: d.ajrasakhaQueriesAsked,
     },
     {
       key: "pushedReviewer",
       label: "Pushed into Reviewer System",
       type: "data",
       wa: d.whatsappPushedToReviewer,
       as: d.ajrasakhaPushedToReviewer,
     },
     {
       key: "answered120",
       label: "Completed within 120 min",
       type: "data",
       wa: d.whatsappAnsweredWithin120Min,
       as: d.ajrasakhaAnsweredWithin120Min,
     },
     {
       key: "passedQuestions",
       label: "Passed questions count",
       type: "data",
       wa: d.whatsappPassedQuestions,
       as: d.ajrasakhaPassedQuestions,
     },
     {
       key: "duplicate",
       label: "Marked Duplicate (GDB)",
       type: "data",
       wa: d.whatsappMarkedDuplicate,
       as: d.ajrasakhaMarkedDuplicate,
     },
     {
       key: "dynamicWeather",
       label: "Dynamic — Weather",
       type: "data",
       wa: d.whatsappDynamicWeather,
       as: d.ajrasakhaDynamicWeather,
     },
     {
       key: "dynamicMarket",
       label: "Dynamic — Market",
       type: "data",
       wa: d.whatsappDynamicMarket,
       as: d.ajrasakhaDynamicMarket,
     },
     {
       key: "dynamicSchemes",
       label: "Dynamic — Schemes",
       type: "data",
       wa: d.whatsappDynamicSchemes,
       as: d.ajrasakhaDynamicSchemes,
     },
     {
       key: "nonGdb",
       label: "Non-GDB answered in 120 min by AEs",
       type: "data",
       wa: d.whatsappNonGdbWithin120,
       as: d.ajrasakhaNonGdbWithin120,
     },
     {
       key: "inReview",
       label: "In Review",
       type: "data",
       wa: d.whatsappInReview,
       as: d.ajrasakhaInReview,
     },
     {
       key: "open",
       label: "Open",
       type: "data",
       wa: d.whatsappOpen,
       as: d.ajrasakhaOpen,
     },
     {
       key: "delayed",
       label: "Delayed",
       type: "data",
       wa: d.whatsappDelayed,
       as: d.ajrasakhaDelayed,
     },
     {
       key: "summaryDelayReason",
       label: "Summary of delay reason",
       type: "data",
       wa: "—",
       as: "—",
     },
     {
       key: "avgResponse",
       label: "Avg. Response Time",
       type: "data",
       wa: formatMinutes(d.whatsappAverageResponseMinutes),
       as: formatMinutes(d.ajrasakhaAverageResponseMinutes),
     },
     {
       key: "adherencePct",
       label: "% Completed within 120 min",
       type: "data",
       wa:
         d.whatsappAdherencePct != null
           ? `${d.whatsappAdherencePct.toFixed(2)}%`
           : "—",
       as:
         d.ajrasakhaAdherencePct != null
           ? `${d.ajrasakhaAdherencePct.toFixed(2)}%`
           : "—",
       highlight: true,
     },
   ];


  const hasSelectedRows = rowExportData.some((row) => checkedRows[row.id]);

  const handleDownloadSelectedFields = () => {
    const selectedRows = rowExportData.filter((row) => checkedRows[row.id]);
    if (!selectedRows.length) return;

    const header = ["Field", "Whatsapp", "AjraSakha", "Notes"];
    const lines = selectedRows.map((row) =>
      [
        csvEscape(row.field),
        csvEscape(row.whatsapp),
        csvEscape(row.ajraSakha),
        csvEscape(row.notes),
      ].join(","),
    );

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
                                colSpan={row.span ? 2 : 1}
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
                                {row.wa}
                              </td>
                              <td className="border-b border-border/40 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-foreground">
                                {row.as}
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
                            <td className="border-b border-r border-border/40 px-3 py-2.5 text-muted-foreground">
                              {row.label}
                            </td>
                            <td className="border-b border-r border-border/40 px-3 py-2.5 tabular-nums">
                              {row.wa ?? "—"}
                            </td>
                            <td className="border-b border-border/40 px-3 py-2.5 tabular-nums">
                              {row.as ?? "—"}
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
