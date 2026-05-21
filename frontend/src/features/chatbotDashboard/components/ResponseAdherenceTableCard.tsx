import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { useState } from "react";

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
}: {
  data?: Partial<ResponseAdherenceTableData> | null;
}) {
  const d = { ...DEFAULT_DATA, ...(data ?? {}) };
  const [checkedRows, setCheckedRows] = useState<Record<string, boolean>>({});
  const toggleRow = (rowId: string) =>
    setCheckedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  const rowCheck = (rowId: string) => (
    <input
      type="checkbox"
      checked={!!checkedRows[rowId]}
      onChange={() => toggleRow(rowId)}
      className="h-4 w-4 cursor-pointer"
    />
  );

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Response Adherence Summary</CardTitle>
        <p className="text-sm text-muted-foreground">
          Source-wise question handling performance
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <tbody>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("date")}</td>
                <td className="border border-border px-3 py-2 font-medium">Date</td>
                <td className="border border-border px-3 py-2">{d.date}</td>
                <td className="border border-border px-3 py-2"></td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("time")}</td>
                <td className="border border-border px-3 py-2 font-medium">Time</td>
                <td className="border border-border px-3 py-2">{d.time}</td>
                <td className="border border-border px-3 py-2">{d.timeWindow}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("header")}</td>
                <td className="border border-border px-3 py-2 font-medium">Source</td>
                <td className="border border-border px-3 py-2 font-semibold">Whatsapp</td>
                <td className="border border-border px-3 py-2 font-semibold">AjraSakha</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("queriesAsked")}</td>
                <td className="border border-border px-3 py-2">Queries Asked</td>
                <td className="border border-border px-3 py-2">{d.whatsappQueriesAsked}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaQueriesAsked}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("pushedReviewer")}</td>
                <td className="border border-border px-3 py-2">Question Pushed into Reviewer System</td>
                <td className="border border-border px-3 py-2">{d.whatsappPushedToReviewer}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaPushedToReviewer}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("answered120")}</td>
                <td className="border border-border px-3 py-2">Question Answered within 120 Min</td>
                <td className="border border-border px-3 py-2">{d.whatsappAnsweredWithin120Min}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaAnsweredWithin120Min}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("duplicate")}</td>
                <td className="border border-border px-3 py-2">Marked Duplicate (Fetched from GDB)</td>
                <td className="border border-border px-3 py-2">{d.whatsappMarkedDuplicate}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaMarkedDuplicate}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("dynamicWeather")}</td>
                <td className="border border-border px-3 py-2">Dynamic - Weather</td>
                <td className="border border-border px-3 py-2">{d.whatsappDynamicWeather}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaDynamicWeather}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("dynamicMarket")}</td>
                <td className="border border-border px-3 py-2">Dynamic - Market</td>
                <td className="border border-border px-3 py-2">{d.whatsappDynamicMarket}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaDynamicMarket}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("dynamicSchemes")}</td>
                <td className="border border-border px-3 py-2">Dynamic - Schemes</td>
                <td className="border border-border px-3 py-2">{d.whatsappDynamicSchemes}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaDynamicSchemes}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("nonGdb")}</td>
                <td className="border border-border px-3 py-2">Non GDB Questions - Answer prepared in 120 Min by AEs</td>
                <td className="border border-border px-3 py-2">{d.whatsappNonGdbWithin120}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaNonGdbWithin120}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("inReview")}</td>
                <td className="border border-border px-3 py-2">Question in Review</td>
                <td className="border border-border px-3 py-2">{d.whatsappInReview}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaInReview}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("open")}</td>
                <td className="border border-border px-3 py-2">Questions are Open</td>
                <td className="border border-border px-3 py-2">{d.whatsappOpen}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaOpen}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("delayed")}</td>
                <td className="border border-border px-3 py-2">Questions are delayed</td>
                <td className="border border-border px-3 py-2">{d.whatsappDelayed}</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaDelayed}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("summaryDelayReason")}</td>
                <td className="border border-border px-3 py-2">Summary of the reason for delaying</td>
                <td className="border border-border px-3 py-2"></td>
                <td className="border border-border px-3 py-2"></td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("avgResponse")}</td>
                <td className="border border-border px-3 py-2">Average time for Response</td>
                <td className="border border-border px-3 py-2">{formatMinutes(d.whatsappAverageResponseMinutes)}</td>
                <td className="border border-border px-3 py-2">{formatMinutes(d.ajrasakhaAverageResponseMinutes)}</td>
              </tr>
              <tr>
                <td className="border border-border px-2 py-2 text-center">{rowCheck("adherencePct")}</td>
                <td className="border border-border px-3 py-2">Percentage of questions completed within 120 min</td>
                <td className="border border-border px-3 py-2">{d.whatsappAdherencePct.toFixed(2)}%</td>
                <td className="border border-border px-3 py-2">{d.ajrasakhaAdherencePct.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
