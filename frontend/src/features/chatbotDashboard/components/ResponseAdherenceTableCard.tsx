import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { useState } from "react";
import { Calendar } from "@/components/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

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
  "pushedReviewer",
  "answered120",
  "summaryDelayReason",
  "avgResponse",
  "adherencePct",
]);

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
    { id: "queriesAsked", field: "Queries Asked", whatsapp: d.whatsappQueriesAsked, ajraSakha: d.ajrasakhaQueriesAsked, notes: "" },
    { id: "pushedReviewer", field: "Questions pushed into the review system", whatsapp: d.whatsappPushedToReviewer, ajraSakha: d.ajrasakhaPushedToReviewer, notes: "" },
    { id: "answered120", field: "Questions answered within 120 minutes", whatsapp: d.whatsappAnsweredWithin120Min, ajraSakha: d.ajrasakhaAnsweredWithin120Min, notes: "" },
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
    anchor.download = `response-adherence-selected-fields-${effectiveDate || todayAsInputDate()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  };

  const rowCheck = (rowId: string) => (
    <input
      type="checkbox"
      checked={!!checkedRows[rowId]}
      onChange={() => toggleRow(rowId)}
      className="h-5 w-5 cursor-pointer accent-[#0d72b9]"
    />
  );

  return (
    <Card className="mb-4 rounded-2xl border border-border/70 bg-muted/10">
      <CardHeader className="pb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="text-base">Response Adherence Summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            Source-wise question handling performance
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-11 min-w-[220px] justify-start border-border/80 bg-background text-sm font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                {format(parseInputDateToLocalDate(effectiveDate), "MMM dd, yyyy")}
              </Button>
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
              />
            </PopoverContent>
          </Popover>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadSelectedFields}
              disabled={!hasSelectedRows}
              className="h-11 px-5 text-base"
            >
              Download Selected Fields
            </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="mb-3 text-xs text-muted-foreground">
            Fetching selected date data...
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <tbody>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("date")}</td>
                <td className="border border-border/70 px-3 py-2 font-medium">Date</td>
                <td className="border border-border/70 px-3 py-2">{d.date || effectiveDate}</td>
                <td className="border border-border/70 px-3 py-2"></td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("time")}</td>
                <td className="border border-border/70 px-3 py-2 font-medium">Time</td>
                <td colSpan={2} className="border border-border/70 px-3 py-2">{d.timeWindow}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("header")}</td>
                <td className="border border-border/70 px-3 py-2 font-medium">Source</td>
                <td className="border border-border/70 px-3 py-2 font-semibold">Whatsapp</td>
                <td className="border border-border/70 px-3 py-2 font-semibold">AjraSakha</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("queriesAsked")}</td>
                <td className="border border-border/70 px-3 py-2">Queries Asked</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappQueriesAsked}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaQueriesAsked}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("pushedReviewer")}</td>
                <td className="border border-border/70 px-3 py-2">Question Pushed into Reviewer System</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappPushedToReviewer}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaPushedToReviewer}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("answered120")}</td>
                <td className="border border-border/70 px-3 py-2">Question Answered within 120 Min</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappAnsweredWithin120Min}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaAnsweredWithin120Min}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("duplicate")}</td>
                <td className="border border-border/70 px-3 py-2">Marked Duplicate (Fetched from GDB)</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappMarkedDuplicate}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaMarkedDuplicate}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("dynamicWeather")}</td>
                <td className="border border-border/70 px-3 py-2">Dynamic - Weather</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappDynamicWeather}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaDynamicWeather}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("dynamicMarket")}</td>
                <td className="border border-border/70 px-3 py-2">Dynamic - Market</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappDynamicMarket}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaDynamicMarket}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("dynamicSchemes")}</td>
                <td className="border border-border/70 px-3 py-2">Dynamic - Schemes</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappDynamicSchemes}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaDynamicSchemes}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("nonGdb")}</td>
                <td className="border border-border/70 px-3 py-2">Non GDB Questions - Answer prepared in 120 Min by AEs</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappNonGdbWithin120}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaNonGdbWithin120}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("inReview")}</td>
                <td className="border border-border/70 px-3 py-2">Question in Review</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappInReview}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaInReview}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("open")}</td>
                <td className="border border-border/70 px-3 py-2">Questions are Open</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappOpen}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaOpen}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("delayed")}</td>
                <td className="border border-border/70 px-3 py-2">Questions are delayed</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappDelayed}</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaDelayed}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("summaryDelayReason")}</td>
                <td className="border border-border/70 px-3 py-2">Summary of the reason for delaying</td>
                <td className="border border-border/70 px-3 py-2"></td>
                <td className="border border-border/70 px-3 py-2"></td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("avgResponse")}</td>
                <td className="border border-border/70 px-3 py-2">Average time for Response</td>
                <td className="border border-border/70 px-3 py-2">{formatMinutes(d.whatsappAverageResponseMinutes)}</td>
                <td className="border border-border/70 px-3 py-2">{formatMinutes(d.ajrasakhaAverageResponseMinutes)}</td>
              </tr>
              <tr>
                <td className="border border-border/70 px-2 py-2 text-center">{rowCheck("adherencePct")}</td>
                <td className="border border-border/70 px-3 py-2">Percentage of questions completed within 120 min</td>
                <td className="border border-border/70 px-3 py-2">{d.whatsappAdherencePct.toFixed(2)}%</td>
                <td className="border border-border/70 px-3 py-2">{d.ajrasakhaAdherencePct.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
