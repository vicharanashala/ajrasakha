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

/**
 * Colors/typography lifted from the app's own theme (`frontend/src/styles.css`'s `:root`
 * OKLCH tokens, converted to hex since email clients don't support `oklch()`), so the emailed
 * report looks like it belongs to the AjraSakha Review System instead of a generic spreadsheet
 * dump. Keep in sync with the frontend copy of this file if the app's theme colors change.
 */
const THEME = {
  font: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  primary: '#72e3ad', // --primary
  primarySoft: '#e8faf1', // tinted --primary background for cards/badges
  primaryBorder: '#bdeed4',
  heading: '#14532d', // dark green heading/value text (brand accent, matches the annam.ai wordmark)
  text: '#171717', // --foreground
  mutedText: '#6b7280', // secondary/caption text
  border: '#e5e7eb', // --border (email-friendly gray)
  rowStripe: '#f6f8f7', // faint tinted zebra stripe
  cardBg: '#ffffff',
};

function buildRowExportData(
  d: ResponseAdherenceTable,
  fallbackDate?: string,
): ReportRow[] {
  const whatsappQueriesAskedDisplay = d.whatsappQueriesAsked > 0 ? d.whatsappQueriesAsked : 'NIL';
  const manualQueriesAskedDisplay = d.manualQueriesAsked > 0 ? d.manualQueriesAsked : 'NIL';

  return [
    { id: "pushedReviewer", field: "Questions pushed into the review system", whatsapp: d.whatsappPushedToReviewer, ajraSakha: d.ajrasakhaPushedToReviewer, manual: d.manualPushedToReviewer, notes: "" },
    { id: "answered120", field: "Questions answered within 120 minutes", whatsapp: d.whatsappAnsweredWithin120Min, ajraSakha: d.ajrasakhaAnsweredWithin120Min, manual: d.manualAnsweredWithin120Min, notes: "" },
    { id: "averageEndToEndQnaCompletion", field: "Average response time for End to End QNA Completion", whatsapp: formatMinutes(d.whatsappAverageEndToEndQnaCompletionMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndQnaCompletionMinutes), manual: formatMinutes(d.manualAverageEndToEndQnaCompletionMinutes), notes: "" },
    { id: "summaryDelayReason", field: "Summary of the reason for delay", whatsapp: "", ajraSakha: "", manual: "", notes: "" },
    { id: "adherencePct", field: "Percentage of questions completed within 120 minutes", whatsapp: `${d.whatsappAdherencePct.toFixed(2)}%`, ajraSakha: `${d.ajrasakhaAdherencePct.toFixed(2)}%`, manual: `${d.manualAdherencePct.toFixed(2)}%`, notes: "" },
    { id: "queriesAsked", field: "Queries Asked", whatsapp: whatsappQueriesAskedDisplay, ajraSakha: d.ajrasakhaQueriesAsked, manual: manualQueriesAskedDisplay, notes: "" },
    { id: "irrevelantQueries", field: "Irrevelant Queries", whatsapp: d.whatsappQueriesAsked > 0 ? d.whatsappQueriesAsked - d.whatsappPushedToReviewer : "NIL", ajraSakha: d.ajrasakhaQueriesAsked > 0 ? d.ajrasakhaQueriesAsked - d.ajrasakhaPushedToReviewer : "NIL", manual: d.manualQueriesAsked > 0 ? d.manualQueriesAsked -  d.manualPushedToReviewer: "NIL", notes: "" },
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
    { id: "averageEndToEndUnique", field: "Average response time for End to End QNA Completion of Unique Questions", whatsapp: formatMinutes(d.whatsappAverageEndToEndUniqueMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndUniqueMinutes), manual: formatMinutes(d.manualAverageEndToEndUniqueMinutes), notes: "" },
    { id: "averageEndToEndDynamic", field: "Average response time for End to End QNA Completion of Dynamic Question", whatsapp: formatMinutes(d.whatsappAverageEndToEndDynamicMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndDynamicMinutes), manual: formatMinutes(d.manualAverageEndToEndDynamicMinutes), notes: "" },
    { id: "averageEndToEndDuplicate", field: "Average response time for End to End QNA Completion of Duplicate Question", whatsapp: formatMinutes(d.whatsappAverageEndToEndDuplicateMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageEndToEndDuplicateMinutes), manual: formatMinutes(d.manualAverageEndToEndDuplicateMinutes), notes: "" },
      //  { id: "avgResponse", field: "Average response time", whatsapp: formatMinutes(d.whatsappAverageResponseMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseMinutes), manual: formatMinutes(d.manualAverageResponseMinutes), notes: "" },
    // { id: "avgResponseGDB", field: "Average response time GDB", whatsapp: formatMinutes(d.whatsappAverageResponseGBDMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseGBDMinutes), manual: formatMinutes(d.manualAverageResponseGBDMinutes), notes: "" },
    // { id: "avgResponseNonGDB", field: "Average response time Non GDB", whatsapp: formatMinutes(d.whatsappAverageResponseNonGBDMinutes), ajraSakha: formatMinutes(d.ajrasakhaAverageResponseNonGBDMinutes), manual: formatMinutes(d.manualAverageResponseNonGBDMinutes), notes: "" },
    { id: "slaBreached", field: "SLA Breached", whatsapp: `${(100 - d.whatsappAdherencePct).toFixed(2)}%`, ajraSakha: `${(100 - d.ajrasakhaAdherencePct).toFixed(2)}%`, manual: `${(100 - d.manualAdherencePct).toFixed(2)}%`, notes: "" },
  ];
}

/**
 * Builds the full Response Adherence report as CSV text (with a UTF-8 BOM), always including
 * every row — the same "full table" shape the old Email Report button always sent, regardless
 * of whichever rows/columns were checked in the download panel.
 *
 * All three source columns are emitted. Unlike the email body — whose highlights table drops
 * Manual while Additional Breakdowns keeps it — the attachment is a single flat table with one
 * fixed header, so it cannot vary per section and carries Manual throughout.
 */
export function buildResponseAdherenceCsv(
  d: ResponseAdherenceTable,
  fallbackDate?: string,
): string {
  const rows = buildRowExportData(d, fallbackDate);
  const header = ['Status', 'Whatsapp', 'AjraSakha', 'Manual', 'Notes'];

  const lines = rows.map(row =>
    [row.field, row.whatsapp, row.ajraSakha, row.manual, row.notes]
      .map(value => csvEscape(value))
      .join(','),
  );

  return ['\uFEFF' + header.join(','), ...lines].join('\r\n');
}

// The 4 headline metrics broken out into their own small table at the top of the email,
// separate from (and no longer duplicated in) the full table below.
const HIGHLIGHT_ROW_IDS = [
  'pushedReviewer',
  'answered120',
  'averageEndToEndQnaCompletion',
  'adherencePct',
];

/**
 * Renders one set of rows as a styled, rounded HTML table card. Used twice by
 * {@link buildResponseAdherenceHtmlTable} — once for the highlight rows, once for everything
 * else — so the two tables look identical apart from which rows they contain and whether they
 * carry the Manual column (`includeManual`): the highlights table is Whatsapp/AjraSakha only,
 * while Additional Breakdowns keeps all three sources.
 */
function renderTableCard(rows: ReportRow[], includeManual: boolean): string {
  if (!rows.length) return '';

  const thStyle =
    `padding:10px 12px;text-align:left;background:${THEME.primary};color:${THEME.heading};` +
    `font-family:${THEME.font};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;`;
  const tdStyle = (striped: boolean) =>
    `padding:9px 12px;border-bottom:1px solid ${THEME.border};font-family:${THEME.font};font-size:13px;` +
    `color:${THEME.text};background:${striped ? THEME.rowStripe : THEME.cardBg};`;
  const fieldTdStyle = (striped: boolean) =>
    `${tdStyle(striped)}font-weight:500;`;

  const headerLabels = ['Status', 'Whatsapp', 'AjraSakha'];
  if (includeManual) {
    headerLabels.push('Manual');
  }
  const headerCells = headerLabels
    .map((label, idx) => `<th style="${thStyle}${idx === 0 ? 'border-top-left-radius:12px;' : ''}${idx === headerLabels.length - 1 ? 'border-top-right-radius:12px;' : ''}">${htmlEscape(label)}</th>`)
    .join('');

  const bodyRows = rows
    .map((row, idx) => {
      const striped = idx % 2 === 1;
      const cells = [
        `<td style="${fieldTdStyle(striped)}">${htmlEscape(row.field)}</td>`,
        `<td style="${tdStyle(striped)}">${htmlEscape(row.whatsapp)}</td>`,
        `<td style="${tdStyle(striped)}">${htmlEscape(row.ajraSakha)}</td>`,
        ...(includeManual
          ? [`<td style="${tdStyle(striped)}">${htmlEscape(row.manual)}</td>`]
          : []),
      ].join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const table =
    `<table style="border-collapse:collapse;width:100%;">` +
    `<thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;

  return `<div style="border:1px solid ${THEME.border};border-radius:12px;overflow:hidden;margin-bottom:16px;">${table}</div>`;
}

/**
 * Same row data as {@link buildResponseAdherenceCsv} (the CSV attachment keeps every row in
 * one flat table), rendered here as two inline-styled HTML tables for the email body: a small
 * highlights table with the 4 headline metrics, followed by the remaining rows.
 */
export function buildResponseAdherenceHtmlTable(
  d: ResponseAdherenceTable,
  fallbackDate?: string,
): string {
  const rows = buildRowExportData(d, fallbackDate);
  const highlightRows = rows.filter(row => HIGHLIGHT_ROW_IDS.includes(row.id));
  // const mainRows = rows.filter(row => !HIGHLIGHT_ROW_IDS.includes(row.id));

  // const sectionLabel =
  //   `<div style="margin:4px 0 10px 2px;font-family:${THEME.font};font-size:13px;font-weight:700;` +
  //   `color:${THEME.heading};text-transform:uppercase;letter-spacing:.04em;">Additional Breakdowns</div>`;

  // Additional Breakdowns table temporarily disabled in the email body (2026-08-20, per request).
  // To restore: uncomment mainRows/sectionLabel above and swap back to the return below.
  // return `${renderTableCard(highlightRows, false)}${mainRows.length ? sectionLabel : ''}${renderTableCard(mainRows, true)}`;
  return `${renderTableCard(highlightRows, false)}`;
}
