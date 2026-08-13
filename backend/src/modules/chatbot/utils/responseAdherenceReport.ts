import type {ResponseAdherenceTable} from '#root/shared/database/interfaces/IChatbotRepository.js';

/**
 * Formats a report row's field label and per-source (Whatsapp / AjraSakha / Manual) values,
 * as a CSV attachment and as an inline HTML table for the Response Adherence Summary report.
 *
 * Ported from the frontend's `rowExportData` / `buildCsvContent` / `buildReportHtmlTable` in
 * `frontend/src/features/chatbotDashboard/components/ResponseAdherenceTableCard.tsx`, which
 * previously built this content in the browser for the (now removed) manual "Email Report"
 * button and still builds it for the "Download .xlsx" button. This is a deliberate duplication,
 * not a shared package, to keep the frontend Download button working unchanged while letting
 * the backend generate the same report unattended for the daily Cloud Run Job. If the report's
 * shape changes on the frontend, mirror the change here too.
 */

type ReportRow = {
  id: string;
  field: string;
  whatsapp: string | number;
  ajraSakha: string | number;
  manual: string | number;
  notes: string;
};

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 Min';
  const totalMinutes = Math.round(minutes);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs === 0) return `${mins} Min`;
  if (mins === 0) return `${hrs} Hr`;
  return `${hrs} Hr. ${mins} Mins`;
}

function csvEscape(value: string | number): string {
  const str = String(value ?? '');
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function htmlEscape(value: string | number): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRowExportData(
  d: ResponseAdherenceTable,
  fallbackDate?: string,
): ReportRow[] {
  const whatsappQueriesAskedDisplay = d.whatsappQueriesAsked > 0 ? d.whatsappQueriesAsked : 'NIL';
  const manualQueriesAskedDisplay = d.manualQueriesAsked > 0 ? d.manualQueriesAsked : 'NIL';

  return [
    { id: "date", field: "Date", whatsapp: d.date || fallbackDate || "", ajraSakha: "", manual: "", notes: "" },
    { id: "time", field: "Time", whatsapp: d.timeWindow, ajraSakha: "", manual: "", notes: "" },
    { id: "header", field: "Source", whatsapp: "Whatsapp", ajraSakha: "AjraSakha", manual: "Manual", notes: "" },
    { id: "queriesAsked", field: "Queries Asked", whatsapp: whatsappQueriesAskedDisplay, ajraSakha: d.ajrasakhaQueriesAsked, manual: manualQueriesAskedDisplay, notes: "" },
    { id: "irrevelantQueries", field: "Irrevelant Queries", whatsapp: d.whatsappQueriesAsked > 0 ? d.whatsappQueriesAsked - d.whatsappPushedToReviewer : "NIL", ajraSakha: d.ajrasakhaQueriesAsked > 0 ? d.ajrasakhaQueriesAsked - d.ajrasakhaPushedToReviewer : "NIL", manual: d.manualQueriesAsked > 0 ? d.manualQueriesAsked -  d.manualPushedToReviewer: "NIL", notes: "" },
    { id: "pushedReviewer", field: "Questions pushed into the review system", whatsapp: d.whatsappPushedToReviewer, ajraSakha: d.ajrasakhaPushedToReviewer, manual: d.manualPushedToReviewer, notes: "" },
    { id: "answered120", field: "Questions answered within 120 minutes", whatsapp: d.whatsappAnsweredWithin120Min, ajraSakha: d.ajrasakhaAnsweredWithin120Min, manual: d.manualAnsweredWithin120Min, notes: "" },
    {id: "answered120Closed",field: "Closed within 120 minutes",whatsapp: `${d.answeredWithin120MinClosedwhatsapp} / ${d.whatsappAnsweredWithin120Min}`,ajraSakha: `${d.answeredWithin120MinClosedajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,manual: `${d.answeredWithin120MinClosedmanual} / ${d.manualAnsweredWithin120Min}`,notes: ""},
    {id: "answered120Pass",field: "Pass within 120 minutes",whatsapp: `${d.answeredWithin120MinPasswhatsapp} / ${d.whatsappAnsweredWithin120Min}`,ajraSakha: `${d.answeredWithin120MinPassajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,manual: `${d.answeredWithin120MinPassmanual} / ${d.manualAnsweredWithin120Min}`,notes: ""},
    {id: "answered120DynamicClosed",field: "Dynamic Closed within 120 minutes",whatsapp: `${d.answeredWithin120MinDynamicClosedwhatsapp} / ${d.whatsappAnsweredWithin120Min}`,ajraSakha: `${d.answeredWithin120MinDynamicClosedajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,manual: `${d.answeredWithin120MinDynamicClosedmanual} / ${d.manualAnsweredWithin120Min}`,notes: ""},
    {id: "answered120DuplicateClosed",field: "Duplicate Closed within 120 minutes",whatsapp: `${d.answeredWithin120MinDuplicateClosedwhatsapp} / ${d.whatsappAnsweredWithin120Min}`,ajraSakha: `${d.answeredWithin120MinDuplicateClosedajrasakha} / ${d.ajrasakhaAnsweredWithin120Min}`,manual: `${d.answeredWithin120MinDuplicateClosedmanual} / ${d.manualAnsweredWithin120Min}`,notes: ""},  
    { id: "duplicate", field: "Marked Duplicate (Fetched from GDB)", whatsapp: d.whatsappMarkedDuplicate, ajraSakha: d.ajrasakhaMarkedDuplicate, manual: d.manualMarkedDuplicate, notes: "" },

    { id: "totalDynamic", field: "Total - Dynamic", whatsapp: d.totalDynamicWhatsappCount, ajraSakha: d.totalDynamicAjrasakhaCount, manual: d.totalDynamicManualCount, notes: "" },
    { id: "dynamicWeather", field: "Dynamic - Weather", whatsapp: d.whatsappdynamicWeatherDynamicCount, ajraSakha: d.ajrasakhadynamicWeatherDynamicCount, manual: d.manualdynamicWeatherDynamicCount, notes: "" },
    { id: "dynamicMarket", field: "Dynamic - Market", whatsapp: d.whatsappdynamicMarketDynamicCount, ajraSakha: d.ajrasakhadynamicMarketDynamicCount, manual:d.manualdynamicMarketDynamicCount, notes: "" },
    { id: "dynamicSchemes", field: "Dynamic - Schemes", whatsapp: d.whatsappdynamicSchemesDynamicCount, ajraSakha: d.ajrasakhadynamicSchemesDynamicCount, manual: d.manualdynamicSchemesDynamicCount, notes: "" },

    { id: "totalStaticDynamic", field: "Total - Static Dynamic", whatsapp: d.totalStaticDynamicWhatsappCount, ajraSakha: d.totalStaticDynamicAjrasakhaCount, manual: d.totalStaticDynamicManualCount, notes: "" },
    { id: "staticdynamicWeather", field: "Static Dynamic - Weather", whatsapp: d.whatsappdynamicWeatherStaticDynamicCount, ajraSakha: d.ajrasakhadynamicWeatherStaticDynamicCount, manual: d.manualdynamicWeatherStaticDynamicCount, notes: "" },
    { id: "staticdynamicMarket", field: "Static Dynamic - Market", whatsapp: d.whatsappdynamicMarketStaticDynamicCount, ajraSakha: d.ajrasakhadynamicMarketStaticDynamicCount, manual:d.manualdynamicMarketStaticDynamicCount, notes: "" },
    { id: "staticdynamicSchemes", field: "Static Dynamic - Schemes", whatsapp: d.whatsappdynamicSchemesStaticDynamicCount, ajraSakha: d.ajrasakhadynamicSchemesStaticDynamicCount, manual: d.manualdynamicSchemesStaticDynamicCount, notes: "" },
    { id: "answeredAfter120Min", field: "Answered After 120 Min", whatsapp: d.whatsAppAnsweredAfter120Min, ajraSakha: d.ajrasakhaAnsweredAfter120Min, manual: d.manualAnsweredAfter120Min, notes: "" },
    // { id: "answeredAfter120Min", field: "Answered After 120 Min", whatsapp: d.whatsAppAnsweredAfter120Min, ajraSakha: d.ajrasakhaAnsweredAfter120Min, manual: d.manualAnsweredAfter120Min, notes: ""},
    {id: "answeredAfter120MinClosed",field: "Closed After 120 Min",whatsapp: `${d.whatsAppAnsweredAfter120MinClosed} / ${d.whatsAppAnsweredAfter120Min}`,ajraSakha: `${d.ajrasakhaAnsweredAfter120MinClosed} / ${d.ajrasakhaAnsweredAfter120Min}`,manual: `${d.manualAnsweredAfter120MinClosed} / ${d.manualAnsweredAfter120Min}`,notes: ""},
    {id: "answeredAfter120MinPass",field: "Pass After 120 Min",whatsapp: `${d.whatsAppAnsweredAfter120MinPass} / ${d.whatsAppAnsweredAfter120Min}`,ajraSakha: `${d.ajrasakhaAnsweredAfter120MinPass} / ${d.ajrasakhaAnsweredAfter120Min}`,manual: `${d.manualAnsweredAfter120MinPass} / ${d.manualAnsweredAfter120Min}`,notes: ""},
    {id: "answeredAfter120MinDynamicClosed",field: "Dynamic Closed After 120 Min",whatsapp: `${d.whatsAppAnsweredAfter120MinDynamicClosed} / ${d.whatsAppAnsweredAfter120Min}`,ajraSakha: `${d.ajrasakhaAnsweredAfter120MinDynamicClosed} / ${d.ajrasakhaAnsweredAfter120Min}`,manual: `${d.manualAnsweredAfter120MinDynamicClosed} / ${d.manualAnsweredAfter120Min}`,notes: ""},
    {id: "answeredAfter120MinDuplicateClosed",field: "Duplicate Closed After 120 Min",whatsapp: `${d.whatsAppAnsweredAfter120MinDuplicateClosed} / ${d.whatsAppAnsweredAfter120Min}`,ajraSakha: `${d.ajrasakhaAnsweredAfter120MinDuplicateClosed} / ${d.ajrasakhaAnsweredAfter120Min}`,manual: `${d.manualAnsweredAfter120MinDuplicateClosed} / ${d.manualAnsweredAfter120Min}`,notes: ""},   
    {id: "tatMinutes",field: "TAT",whatsapp: formatMinutes(d.whatsappTatMinutes),ajraSakha: formatMinutes(d.ajrasakhaTatMinutes),manual: formatMinutes(d.manualTatMinutes), notes: ""},
    {id: "averageTimeToAuthorMinutes",field: "Average Time to Author",whatsapp: formatMinutes(d.whatsappAverageTimeToAuthorMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageTimeToAuthorMinutes),manual: formatMinutes(d.manualAverageTimeToAuthorMinutes),notes: ""},
    {id: "averageReviewAcceptMinutes",field: "Average Time for Reviewing + Accepting",whatsapp: formatMinutes(d.whatsappAverageReviewAcceptMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageReviewAcceptMinutes),manual: formatMinutes(d.manualAverageReviewAcceptMinutes),notes: ""},
    {id: "averageReviewModifyMinutes",field: "Average Time for Reviewing + Modifying",whatsapp: formatMinutes(d.whatsappAverageReviewModifyMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageReviewModifyMinutes),manual: formatMinutes(d.manualAverageReviewModifyMinutes),notes: ""},
    {id: "averageReviewRejectReauthorMinutes",field: "Average Time for Reviewing + Rejecting + Re-Authoring",whatsapp: formatMinutes(d.whatsappAverageReviewRejectReauthorMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageReviewRejectReauthorMinutes),manual: formatMinutes(d.manualAverageReviewRejectReauthorMinutes),notes: ""},
    {id: "averageModeratingMinutes",field: "Average Time for Moderating",whatsapp: formatMinutes(d.whatsappAverageModeratingMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageModeratingMinutes),manual: formatMinutes(d.manualAverageModeratingMinutes),notes: ""},
    {id: "averageGatekeepingMinutes",field: "Average Time to Gatekeeping",whatsapp: formatMinutes(d.whatsappAverageGatekeepingMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageGatekeepingMinutes),manual: formatMinutes(d.manualAverageGatekeepingMinutes),notes: ""},
    {id: "averageAuditingMinutes",field: "Average Time to Auditing",whatsapp: formatMinutes(d.whatsappAverageAuditingMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageAuditingMinutes),manual: formatMinutes(d.manualAverageAuditingMinutes),notes: ""},
    {id: "averageReroutedCompletionMinutes",field: "Average Time for Rerouted Questions to be Completed",whatsapp: formatMinutes(d.whatsappAverageReroutedCompletionMinutes),ajraSakha: formatMinutes(d.ajrasakhaAverageReroutedCompletionMinutes),manual: formatMinutes(d.manualAverageReroutedCompletionMinutes),notes: ""},
    {id: "slaBreachedCount",field: "SLA Breached Count",whatsapp: d.whatsappSlaBreachedCount,ajraSakha: d.ajrasakhaSlaBreachedCount, manual: d.manualSlaBreachedCount,notes: ""},
    // { id: "nonGdb", field: "Non GDB Questions - Answer prepared in 120 Min by AEs", whatsapp: d.whatsappNonGdbWithin120, ajraSakha: d.ajrasakhaNonGdbWithin120, manual: d.manualNonGdbWithin120, notes: "" },
    { id: "inReview", field: "Question in Review", whatsapp: d.whatsappInReview, ajraSakha: d.ajrasakhaInReview, manual: d.manualInReview, notes: "" },
    { id: "open", field: "Questions are Open", whatsapp: d.whatsappOpen, ajraSakha: d.ajrasakhaOpen, manual: d.manualOpen, notes: "" },
    { id: "delayed", field: "Questions are delayed", whatsapp: d.whatsappDelayed, ajraSakha: d.ajrasakhaDelayed, manual: d.manualDelayed, notes: "" },
    {id: "closed", field: "Questions are closed", whatsapp: d.whatsappClosedCount, ajraSakha: d.ajrasakhaClosedCount, manual: d.manualClosedCount, notes:""},
    {id: "pending", field: "Questions are pending", whatsapp: d.whatsappPendingCount, ajraSakha: d.ajrasakhaPendingCount, manual: d.manualPendingCount, notes:""},
    // {id: "nonAgri", field: "Questions are non-agri", whatsapp: d.whatsappNonAgriCount, ajraSakha: d.ajrasakhaNonAgriCount, manual: d.manualNonAgriCount, notes:""},
    // {id: "dynamic", field: "Dynamic Question", whatsapp: d.whatsappDynamicCount, ajraSakha: d.ajrasakhaDynamicCount, manual: d.manualDynamicCount, notes:""},
    // {id: "duplicate", field: "Duplicate Question", whatsapp: d.whatsappDuplicateCount, ajraSakha: d.ajrasakhaDuplicateCount, manual: d.manualDuplicateCount, notes:""},
    {id: "hold", field: "Questions on hold", whatsapp: d.whatsappHoldCount, ajraSakha: d.ajrasakhaHoldCount, manual: d.manualHoldCount, notes:""},
    {id: "paeSubmited", field: "PAE Submited Questions", whatsapp: d.whatsappPaeSubmitedCount, ajraSakha: d.ajrasakhaPaeSubmitedCount, manual: d.manualPaeSubmitedCount, notes:""},
    {id: "paeAssignedQuestions",field: "PAE Assigned Questions",whatsapp: d.whatsappPaeAssignedQuestions ?? 0,ajraSakha: d.ajrasakhaPaeAssignedQuestions ?? 0,manual: d.manualPaeAssignedQuestions ?? 0, notes: ""},
    {id: "paeContributionToGDB",field: "PAE Contribution to GDB",whatsapp: d.whatsappPaeContributionToGDB ?? 0,ajraSakha: d.ajrasakhaPaeContributionToGDB ?? 0,manual: d.manualPaeContributionToGDB ?? 0, notes: ""},
    {id: "paeContributionToGDBPct",field: "PAE Contribution to GDB (%)",whatsapp: `${d.whatsappPaeContributionToGDBPct ?? 0}%`,ajraSakha: `${d.ajrasakhaPaeContributionToGDBPct ?? 0}%`,manual: `${d.manualPaeContributionToGDBPct ?? 0}%`, notes: ""},
// {id: "dynamicClosed", field: "Dynamic Closed Questions", whatsapp: d.whatsappDynamicCLosedCount, ajraSakha: d.ajrasakhaDynamicCLosedCount, manual: d.manualDynamicCLosedCount, notes:""},
    {id: "rerouted", field: "Rerouted Questions", whatsapp: d.whatsappReroutedCount, ajraSakha: d.ajrasakhaReroutedCount, manual: d.manualReroutedCount, notes:""},
    {id: "pass", field: "Pass Questions", whatsapp: d.whatsappPassCount, ajraSakha: d.ajrasakhaPassCount, manual: d.manualPassCount, notes:""},
    // {id: "duplicateClosed", field: "Duplicate Closed Questions", whatsapp: d.whatsappDuplicateClosedCount, ajraSakha: d.ajrasakhaDuplicateClosedCount, manual: d.manualDuplicateClosedCount, notes:""},
    { id: "summaryDelayReason", field: "Summary of the reason for delay", whatsapp: "", ajraSakha: "", manual: "", notes: "" },
    { id: "averageEndToEndQnaCompletion", field: "Average response time for End to End QNA Completion", whatsapp: formatMinutes(d.whatsappAverageEndToEndQnaCompletionMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndQnaCompletionMinutes), manual: formatMinutes(d.manualAverageEndToEndQnaCompletionMinutes), notes: "" },
    { id: "averageEndToEndUnique", field: "Average response time for End to End QNA Completion of Unique Questions", whatsapp: formatMinutes(d.whatsappAverageEndToEndUniqueMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndUniqueMinutes), manual: formatMinutes(d.manualAverageEndToEndUniqueMinutes), notes: "" },
    { id: "averageEndToEndDynamic", field: "Average response time for End to End QNA Completion of Dynamic Question", whatsapp: formatMinutes(d.whatsappAverageEndToEndDynamicMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndDynamicMinutes), manual: formatMinutes(d.manualAverageEndToEndDynamicMinutes), notes: "" },
    { id: "averageEndToEndDuplicate", field: "Average response time for End to End QNA Completion of Duplicate Question", whatsapp: formatMinutes(d.whatsappAverageEndToEndDuplicateMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndDuplicateMinutes), manual: formatMinutes(d.manualAverageEndToEndDuplicateMinutes), notes: "" },
      //  { id: "avgResponse", field: "Average response time", whatsapp: formatMinutes(d.whatsappAverageResponseMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseMinutes), manual: formatMinutes(d.manualAverageResponseMinutes), notes: "" },
    // { id: "avgResponseGDB", field: "Average response time GDB", whatsapp: formatMinutes(d.whatsappAverageResponseGBDMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseGBDMinutes), manual: formatMinutes(d.manualAverageResponseGBDMinutes), notes: "" },
    // { id: "avgResponseNonGDB", field: "Average response time Non GDB", whatsapp: formatMinutes(d.whatsappAverageResponseNonGBDMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseNonGBDMinutes), manual: formatMinutes(d.manualAverageResponseNonGBDMinutes), notes: "" },
    { id: "slaBreached", field: "SLA Breached", whatsapp: `${(100 - d.whatsappAdherencePct).toFixed(2)}%`, ajraSakha: `${(100 - d.ajrasakhaAdherencePct).toFixed(2)}%`, manual: `${(100 - d.manualAdherencePct).toFixed(2)}%`, notes: "" },
    { id: "adherencePct", field: "Percentage of questions completed within 120 minutes", whatsapp: `${d.whatsappAdherencePct.toFixed(2)}%`, ajraSakha: `${d.ajrasakhaAdherencePct.toFixed(2)}%`, manual: `${d.manualAdherencePct.toFixed(2)}%`, notes: "" },
  ];
}

/**
 * Builds the full Response Adherence report as CSV text (with a UTF-8 BOM, matching the
 * frontend's download/email output exactly), always including every row and all three
 * source columns — the same "full table" shape the old Email Report button always sent,
 * regardless of whichever rows/columns were checked in the download panel.
 */
export function buildResponseAdherenceCsv(
  d: ResponseAdherenceTable,
  fallbackDate?: string,
): string {
  const rows = buildRowExportData(d, fallbackDate);
  const header = ['Field', 'Whatsapp', 'AjraSakha', 'Manual', 'Notes'];

  const lines = rows.map(row =>
    [row.field, row.whatsapp, row.ajraSakha, row.manual, row.notes]
      .map(value => csvEscape(value))
      .join(','),
  );

  return ['\uFEFF' + header.join(','), ...lines].join('\r\n');
}

/**
 * Same row data as {@link buildResponseAdherenceCsv}, rendered as an inline-styled HTML table
 * for the email body.
 */
export function buildResponseAdherenceHtmlTable(
  d: ResponseAdherenceTable,
  fallbackDate?: string,
): string {
  const rows = buildRowExportData(d, fallbackDate);

  const thStyle =
    'padding:8px;border:1px solid #e5e5e5;text-align:left;background:#f5f5f5;font-family:sans-serif;font-size:13px;';
  const tdStyle =
    'padding:8px;border:1px solid #e5e5e5;font-family:sans-serif;font-size:13px;';

  const headerCells = ['Field', 'Whatsapp', 'AjraSakha', 'Manual', 'Notes']
    .map(label => `<th style="${thStyle}">${htmlEscape(label)}</th>`)
    .join('');

  const bodyRows = rows
    .map(row => {
      const cells = [row.field, row.whatsapp, row.ajraSakha, row.manual, row.notes]
        .map(value => `<td style="${tdStyle}">${htmlEscape(value)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table style="border-collapse:collapse;width:100%;margin-top:12px;"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}
