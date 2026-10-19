import PDFDocument from 'pdfkit';
import { annamLogoInlineAttachment } from './emailAssets.js';

export interface UserSessionLog {
  sessionIndex: number;
  dateStr: string;
  checkInTime: string;
  checkOutTime: string;
  sessionHours: string;
  sessionMs: number;
  cumulativeHours: string;
  cumulativeMs: number;
  isActiveNow?: boolean;
}

export interface UserActivityReportData {
  userName: string;
  userDesignation: string;
  userRole: string;
  startDate: Date;
  endDate: Date;
  totalHoursInRevCycle: number;
  authoredCount: number;
  totalAuthoringMs: number;
  reviewedCount: number;
  totalReviewingMs: number;
  revCounts: number[];
  moderatedCount: number;
  totalModeratingMs: number;
  auditedCount: number;
  totalAuditingMs: number;
  gatekeepedCount: number;
  totalGatekeepingMs: number;
  gdbPushedCount: number;
  sessions?: UserSessionLog[];
  generatedAt?: Date;
}

/**
 * Formats milliseconds to HH:MM:SS
 */
function formatMsToHMS(ms: number): string {
  if (!ms || ms <= 0 || isNaN(ms)) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats hours with 2 decimals
 */
function formatHours(hrs: number): string {
  if (!hrs || hrs <= 0 || isNaN(hrs)) return '0.00 hrs';
  return `${hrs.toFixed(2)} hrs`;
}

/**
 * Formats Date to Indian Standard Time string
 */
function formatIST(d: Date): string {
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Generates an executive, single-page, card-based PDF report for individual user activity.
 */
export async function buildUserActivityPdfReport(
  data: UserActivityReportData,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    bufferPages: true,
    info: {
      Title: `Activity Report - ${data.userName}`,
      Author: 'AjraSakha System',
      Subject: `Individual User Activity Report`,
      CreationDate: data.generatedAt || new Date(),
    },
  });

  const buffers: Buffer[] = [];
  doc.on('data', buffers.push.bind(buffers));

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  const pageWidth = 595.28;
  const pageMargin = 36;
  const contentWidth = pageWidth - 2 * pageMargin; // 523.28 pt

  // 1. TOP ACCENT STRIP
  doc.rect(0, 0, pageWidth, 5).fill('#059669');

  // 2. HEADER BAR (Logo & Report Meta)
  try {
    const logoBuffer = annamLogoInlineAttachment().content;
    doc.image(logoBuffer, pageMargin, 16, { width: 95 });
  } catch {
    doc.fillColor('#059669').fontSize(14).font('Helvetica-Bold').text('ANNAM.AI', pageMargin, 20);
  }

  const headerRightX = 180;
  const headerRightW = pageWidth - pageMargin - headerRightX;

  doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text(
    'USER ACTIVITY REPORT',
    headerRightX,
    16,
    { width: headerRightW, align: 'right' },
  );

  doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(
    'AjraSakha Agricultural Intelligence Platform',
    headerRightX,
    33,
    { width: headerRightW, align: 'right' },
  );

  const genDateStr = formatIST(data.generatedAt || new Date());
  doc.fillColor('#94A3B8').fontSize(7).font('Helvetica').text(
    `Generated on: ${genDateStr} IST`,
    headerRightX,
    43,
    { width: headerRightW, align: 'right' },
  );

  // 3. USER PROFILE & PERIOD CARD
  const profileY = 56;
  const profileH = 46;
  doc.roundedRect(pageMargin, profileY, contentWidth, profileH, 5)
    .fillAndStroke('#F8FAFC', '#E2E8F0');

  // Left side: User Name & Role Badge
  doc.fillColor('#0F172A').fontSize(12).font('Helvetica-Bold').text(
    data.userName,
    pageMargin + 12,
    profileY + 8,
    { width: 220, ellipsis: true },
  );

  // Role Pill Badge
  const roleX = pageMargin + 12;
  const roleY = profileY + 26;
  const roleText = data.userDesignation.toUpperCase();
  const rolePillWidth = Math.min(220, roleText.length * 6 + 16);
  doc.roundedRect(roleX, roleY, rolePillWidth, 14, 3).fill('#ECFDF5');
  doc.fillColor('#065F46').fontSize(7).font('Helvetica-Bold').text(
    roleText,
    roleX + 8,
    roleY + 3.5,
  );

  // Middle: Reporting Period
  const periodX = pageMargin + 210;
  doc.fillColor('#64748B').fontSize(6.5).font('Helvetica-Bold').text(
    'ACTIVITY PERIOD (IST)',
    periodX,
    profileY + 9,
  );
  doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica-Bold').text(
    `${formatIST(data.startDate)}  to  ${formatIST(data.endDate)}`,
    periodX,
    profileY + 23,
    { width: 195 },
  );

  // Right side: Rev Cycle Hours Stat Box
  const revCycleW = 105;
  const revCycleX = pageMargin + contentWidth - revCycleW - 10;
  doc.roundedRect(revCycleX, profileY + 6, revCycleW, 34, 4).fillAndStroke('#EFF6FF', '#BFDBFE');
  doc.fillColor('#1E40AF').fontSize(6.5).font('Helvetica-Bold').text(
    'TOTAL REV CYCLE',
    revCycleX,
    profileY + 10,
    { width: revCycleW, align: 'center' },
  );
  doc.fillColor('#1D4ED8').fontSize(11).font('Helvetica-Bold').text(
    formatHours(data.totalHoursInRevCycle),
    revCycleX,
    profileY + 21,
    { width: revCycleW, align: 'center' },
  );

  // 4. PERFORMANCE METRICS (3 COLUMNS x 2 ROWS)
  const gridY = 110;
  const cardW = (contentWidth - 2 * 9) / 3; // ~168.4 pt
  const cardH = 72;
  const colGap = 9;
  const rowGap = 8;

  interface ActivityCardConfig {
    title: string;
    count: number;
    totalMs: number;
    accentColor: string;
    bgColor: string;
    borderColor: string;
    badgeText?: string;
  }

  const cards: ActivityCardConfig[] = [
    {
      title: 'Authoring',
      count: data.authoredCount,
      totalMs: data.totalAuthoringMs,
      accentColor: '#D97706',
      bgColor: '#FFFBEB',
      borderColor: '#FDE68A',
      badgeText: 'Questions Authored',
    },
    {
      title: 'Reviewing',
      count: data.reviewedCount,
      totalMs: data.totalReviewingMs,
      accentColor: '#2563EB',
      bgColor: '#EFF6FF',
      borderColor: '#BFDBFE',
      badgeText: 'Reviews Finished',
    },
    {
      title: 'Moderating',
      count: data.moderatedCount,
      totalMs: data.totalModeratingMs,
      accentColor: '#059669',
      bgColor: '#ECFDF5',
      borderColor: '#A7F3D0',
      badgeText: 'Questions Moderated',
    },
    {
      title: 'Auditing',
      count: data.auditedCount,
      totalMs: data.totalAuditingMs,
      accentColor: '#7C3AED',
      bgColor: '#F5F3FF',
      borderColor: '#DDD6FE',
      badgeText: 'Audit Validated',
    },
    {
      title: 'Gatekeeping',
      count: data.gatekeepedCount,
      totalMs: data.totalGatekeepingMs,
      accentColor: '#0D9488',
      bgColor: '#F0FDFA',
      borderColor: '#99F6E4',
      badgeText: 'Gate Passed',
    },
    {
      title: 'GDB Pushed',
      count: data.gdbPushedCount,
      totalMs: 0,
      accentColor: '#E11D48',
      bgColor: '#FFF1F2',
      borderColor: '#FECDD3',
      badgeText: 'Authored to GDB',
    },
  ];

  const drawCard = (card: ActivityCardConfig, x: number, y: number) => {
    // Card background & border
    doc.lineWidth(1).roundedRect(x, y, cardW, cardH, 5).fillAndStroke(card.bgColor, card.borderColor);

    // Left color indicator
    doc.roundedRect(x + 7, y + 8, 3.5, cardH - 16, 1.5).fill(card.accentColor);

    // Title
    doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica-Bold').text(
      card.title,
      x + 16,
      y + 8,
      { width: cardW - 24 },
    );

    // Count value
    doc.fillColor(card.accentColor).fontSize(16).font('Helvetica-Bold').text(
      String(card.count),
      x + 16,
      y + 20,
      { width: cardW - 24 },
    );

    // Bottom Stats (Avg time & Total hours)
    if (card.title !== 'GDB Pushed') {
      const avgMs = card.count > 0 ? card.totalMs / card.count : 0;
      const totalHoursNum = card.totalMs / (1000 * 60 * 60);

      const statY = y + 42;
      doc.fillColor('#64748B').fontSize(6).font('Helvetica-Bold').text('AVG TIME', x + 16, statY);
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(formatMsToHMS(avgMs), x + 16, statY + 8);

      const totalHoursX = x + cardW / 2 + 6;
      doc.fillColor('#64748B').fontSize(6).font('Helvetica-Bold').text('TOTAL TIME', totalHoursX, statY);
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(formatHours(totalHoursNum), totalHoursX, statY + 8);
    } else {
      const statY = y + 42;
      doc.fillColor('#64748B').fontSize(6).font('Helvetica-Bold').text('CONVERSION STATUS', x + 16, statY);
      const percent = data.authoredCount > 0 ? Math.round((data.gdbPushedCount / data.authoredCount) * 100) : 0;
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(
        `${data.gdbPushedCount} of ${data.authoredCount} authored (${percent}%)`,
        x + 16,
        statY + 8,
        { width: cardW - 24 },
      );
    }
  };

  // Render the 6 cards in a 3x2 grid
  cards.forEach((c, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const cx = pageMargin + col * (cardW + colGap);
    const cy = gridY + row * (cardH + rowGap);
    drawCard(c, cx, cy);
  });

  // 5. REVIEW ROUNDS BREAKDOWN STRIP (REV 1 - REV 9)
  const revStripY = gridY + 2 * cardH + rowGap + 8;
  const revStripH = 34;

  doc.roundedRect(pageMargin, revStripY, contentWidth, revStripH, 5)
    .fillAndStroke('#F8FAFC', '#E2E8F0');

  doc.fillColor('#475569').fontSize(7).font('Helvetica-Bold').text(
    'REVIEW LEVEL BREAKDOWN (REV 1 TO REV 9)',
    pageMargin + 10,
    revStripY + 5,
  );

  const numCols = 9;
  const colCellW = (contentWidth - 20) / numCols;
  for (let i = 1; i <= 9; i++) {
    const cellX = pageMargin + 10 + (i - 1) * colCellW;
    const countVal = data.revCounts[i] || 0;

    // Header label
    doc.fillColor('#64748B').fontSize(6.5).font('Helvetica').text(
      `Rev ${i}`,
      cellX,
      revStripY + 14,
      { width: colCellW, align: 'center' },
    );

    // Value
    doc.fillColor(countVal > 0 ? '#1D4ED8' : '#94A3B8')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(String(countVal), cellX, revStripY + 22, {
        width: colCellW,
        align: 'center',
      });
  }

  // 6. DETAILED ACTIVITY SUMMARY TABLE
  const tableY = revStripY + revStripH + 10;
  doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold').text(
    'ACTIVITY METRICS BREAKDOWN',
    pageMargin,
    tableY,
  );

  const tHeaderY = tableY + 13;
  const tHeaderH = 18;

  // Table header background
  doc.roundedRect(pageMargin, tHeaderY, contentWidth, tHeaderH, 3).fill('#0F172A');

  const colWidths = [120, 60, 95, 85, 163.28];
  const colX = [
    pageMargin + 8,
    pageMargin + 120,
    pageMargin + 180,
    pageMargin + 275,
    pageMargin + 360,
  ];

  doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold');
  doc.text('ACTIVITY / ROLE', colX[0], tHeaderY + 5, { width: colWidths[0] });
  doc.text('COUNT', colX[1], tHeaderY + 5, { width: colWidths[1], align: 'center' });
  doc.text('AVG DURATION', colX[2], tHeaderY + 5, { width: colWidths[2], align: 'center' });
  doc.text('TOTAL HOURS', colX[3], tHeaderY + 5, { width: colWidths[3], align: 'center' });
  doc.text('DETAILS / STATUS', colX[4], tHeaderY + 5, { width: colWidths[4] });

  // Table rows
  const tableRows = [
    {
      role: 'Question Authoring',
      count: data.authoredCount,
      avg: formatMsToHMS(data.authoredCount > 0 ? data.totalAuthoringMs / data.authoredCount : 0),
      hours: formatHours(data.totalAuthoringMs / (1000 * 60 * 60)),
      notes: `GDB Pushed: ${data.gdbPushedCount} question(s)`,
    },
    {
      role: 'Question Reviewing',
      count: data.reviewedCount,
      avg: formatMsToHMS(data.reviewedCount > 0 ? data.totalReviewingMs / data.reviewedCount : 0),
      hours: formatHours(data.totalReviewingMs / (1000 * 60 * 60)),
      notes: `Active across Rev 1 - Rev 9 levels`,
    },
    {
      role: 'Question Moderation',
      count: data.moderatedCount,
      avg: formatMsToHMS(data.moderatedCount > 0 ? data.totalModeratingMs / data.moderatedCount : 0),
      hours: formatHours(data.totalModeratingMs / (1000 * 60 * 60)),
      notes: 'Moderation review completions',
    },
    {
      role: 'Question Auditing',
      count: data.auditedCount,
      avg: formatMsToHMS(data.auditedCount > 0 ? data.totalAuditingMs / data.auditedCount : 0),
      hours: formatHours(data.totalAuditingMs / (1000 * 60 * 60)),
      notes: 'Auditor verification completions',
    },
    {
      role: 'Gatekeeping',
      count: data.gatekeepedCount,
      avg: formatMsToHMS(data.gatekeepedCount > 0 ? data.totalGatekeepingMs / data.gatekeepedCount : 0),
      hours: formatHours(data.totalGatekeepingMs / (1000 * 60 * 60)),
      notes: 'Gatekeeper screening completions',
    },
  ];

  let currentY = tHeaderY + tHeaderH;
  const rowH = 17;

  tableRows.forEach((row, rIdx) => {
    const isEven = rIdx % 2 === 1;
    if (isEven) {
      doc.rect(pageMargin, currentY, contentWidth, rowH).fill('#F8FAFC');
    }

    doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica-Bold').text(
      row.role,
      colX[0],
      currentY + 4.5,
      { width: colWidths[0] },
    );

    doc.fillColor('#0F172A').fontSize(7.5).font('Helvetica-Bold').text(
      String(row.count),
      colX[1],
      currentY + 4.5,
      { width: colWidths[1], align: 'center' },
    );

    doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(
      row.avg,
      colX[2],
      currentY + 4.5,
      { width: colWidths[2], align: 'center' },
    );

    doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(
      row.hours,
      colX[3],
      currentY + 4.5,
      { width: colWidths[3], align: 'center' },
    );

    doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(
      row.notes,
      colX[4],
      currentY + 4.5,
      { width: colWidths[4] },
    );

    // Row underline
    doc.moveTo(pageMargin, currentY + rowH).lineTo(pageMargin + contentWidth, currentY + rowH)
      .strokeColor('#E2E8F0').lineWidth(0.5).stroke();

    currentY += rowH;
  });

  // Table Summary Row
  const totalVolume =
    data.authoredCount +
    data.reviewedCount +
    data.moderatedCount +
    data.auditedCount +
    data.gatekeepedCount;

  const totalActionHours =
    (data.totalAuthoringMs +
      data.totalReviewingMs +
      data.totalModeratingMs +
      data.totalAuditingMs +
      data.totalGatekeepingMs) /
    (1000 * 60 * 60);

  doc.rect(pageMargin, currentY, contentWidth, rowH).fill('#ECFDF5');

  doc.fillColor('#065F46').fontSize(7.5).font('Helvetica-Bold').text(
    'TOTAL COMBINED VOLUME',
    colX[0],
    currentY + 4.5,
    { width: colWidths[0] },
  );

  doc.fillColor('#065F46').fontSize(8).font('Helvetica-Bold').text(
    String(totalVolume),
    colX[1],
    currentY + 4.5,
    { width: colWidths[1], align: 'center' },
  );

  doc.fillColor('#047857').fontSize(7).font('Helvetica-Bold').text(
    'Total Active Hours:',
    colX[2],
    currentY + 4.5,
    { width: colWidths[2], align: 'center' },
  );

  doc.fillColor('#065F46').fontSize(8).font('Helvetica-Bold').text(
    formatHours(totalActionHours),
    colX[3],
    currentY + 4.5,
    { width: colWidths[3], align: 'center' },
  );

  doc.fillColor('#047857').fontSize(7).font('Helvetica').text(
    `Rev Cycle: ${formatHours(data.totalHoursInRevCycle)}`,
    colX[4],
    currentY + 4.5,
    { width: colWidths[4] },
  );

  doc.moveTo(pageMargin, currentY + rowH).lineTo(pageMargin + contentWidth, currentY + rowH)
    .strokeColor('#10B981').lineWidth(1).stroke();

  // 7. CHECK-IN / CHECK-OUT SESSIONS & CUMULATIVE TIME
  const sessions = data.sessions || [];
  currentY += rowH + 10;

  // Prominent Header Bar for Cumulative Working Hours
  const sessionHeaderH = 24;
  doc.roundedRect(pageMargin, currentY, contentWidth, sessionHeaderH, 4)
    .fillAndStroke('#F8FAFC', '#E2E8F0');

  doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica-Bold').text(
    'CHECK-IN & CHECK-OUT SESSIONS',
    pageMargin + 10,
    currentY + 5,
  );
  doc.fillColor('#64748B').fontSize(6).font('Helvetica').text(
    'Detailed review cycle attendance log (excluding breaks)',
    pageMargin + 10,
    currentY + 14,
  );

  // Main Prominent Metric: Cumulative Working Time Banner on Right
  const cumBoxW = 210;
  const cumBoxX = pageMargin + contentWidth - cumBoxW - 6;
  const cumBoxY = currentY + 3;
  const cumBoxH = 18;

  doc.roundedRect(cumBoxX, cumBoxY, cumBoxW, cumBoxH, 3)
    .fillAndStroke('#ECFDF5', '#A7F3D0');

  doc.fillColor('#065F46').fontSize(6.5).font('Helvetica-Bold').text(
    'CUMULATIVE WORKING TIME:',
    cumBoxX + 8,
    cumBoxY + 5,
  );
  doc.fillColor('#047857').fontSize(8.5).font('Helvetica-Bold').text(
    formatHours(data.totalHoursInRevCycle),
    cumBoxX + cumBoxW - 65,
    cumBoxY + 4,
    { width: 58, align: 'right' },
  );

  currentY += sessionHeaderH + 6;

  // Session Table Header Setup
  const sessionColWidths = [45, 80, 95, 95, 100, 108.28];
  const sessionColX = [
    pageMargin + 8,
    pageMargin + 45,
    pageMargin + 125,
    pageMargin + 220,
    pageMargin + 315,
    pageMargin + 415,
  ];

  const drawSessionTableHeader = (y: number) => {
    doc.roundedRect(pageMargin, y, contentWidth, 16, 2).fill('#1E293B');
    doc.fillColor('#FFFFFF').fontSize(6.5).font('Helvetica-Bold');
    doc.text('SESSION', sessionColX[0], y + 4.5, { width: sessionColWidths[0] - 8, align: 'center' });
    doc.text('DATE', sessionColX[1], y + 4.5, { width: sessionColWidths[1] });
    doc.text('CHECK-IN (FROM)', sessionColX[2], y + 4.5, { width: sessionColWidths[2], align: 'center' });
    doc.text('CHECK-OUT (TO)', sessionColX[3], y + 4.5, { width: sessionColWidths[3], align: 'center' });
    doc.text('WORKING HOURS', sessionColX[4], y + 4.5, { width: sessionColWidths[4], align: 'center' });
    doc.text('CUMULATIVE HOURS', sessionColX[5], y + 4.5, { width: sessionColWidths[5] - 8, align: 'center' });
  };

  drawSessionTableHeader(currentY);
  currentY += 16;

  const sessionRowH = 15;
  const maxContentY = 765;

  if (sessions.length === 0) {
    doc.rect(pageMargin, currentY, contentWidth, 18).fill('#F8FAFC');
    doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(
      'No check-in / check-out records found for the selected period.',
      pageMargin,
      currentY + 5,
      { width: contentWidth, align: 'center' },
    );
    doc.moveTo(pageMargin, currentY + 18).lineTo(pageMargin + contentWidth, currentY + 18)
      .strokeColor('#E2E8F0').lineWidth(0.5).stroke();
    currentY += 18;
  } else {
    sessions.forEach((s, sIdx) => {
      if (currentY + sessionRowH > maxContentY) {
        doc.addPage();
        doc.rect(0, 0, pageWidth, 5).fill('#059669');
        currentY = 40;
        drawSessionTableHeader(currentY);
        currentY += 16;
      }

      const isEven = sIdx % 2 === 1;
      if (isEven) {
        doc.rect(pageMargin, currentY, contentWidth, sessionRowH).fill('#F8FAFC');
      }

      // Session index
      doc.fillColor('#64748B').fontSize(6.5).font('Helvetica').text(
        `#${s.sessionIndex}`,
        sessionColX[0],
        currentY + 4,
        { width: sessionColWidths[0] - 8, align: 'center' },
      );

      // Date
      doc.fillColor('#1E293B').fontSize(6.5).font('Helvetica-Bold').text(
        s.dateStr,
        sessionColX[1],
        currentY + 4,
        { width: sessionColWidths[1] },
      );

      // Check-in
      doc.fillColor('#0F172A').fontSize(6.5).font('Helvetica').text(
        s.checkInTime,
        sessionColX[2],
        currentY + 4,
        { width: sessionColWidths[2], align: 'center' },
      );

      // Check-out
      if (s.isActiveNow) {
        doc.fillColor('#059669').fontSize(6.5).font('Helvetica-Bold').text(
          'Active Now',
          sessionColX[3],
          currentY + 4,
          { width: sessionColWidths[3], align: 'center' },
        );
      } else {
        doc.fillColor('#0F172A').fontSize(6.5).font('Helvetica').text(
          s.checkOutTime,
          sessionColX[3],
          currentY + 4,
          { width: sessionColWidths[3], align: 'center' },
        );
      }

      // Session hours
      doc.fillColor('#334155').fontSize(6.5).font('Helvetica').text(
        s.sessionHours,
        sessionColX[4],
        currentY + 4,
        { width: sessionColWidths[4], align: 'center' },
      );

      // Cumulative hours (main highlighted column)
      doc.fillColor('#047857').fontSize(7).font('Helvetica-Bold').text(
        s.cumulativeHours,
        sessionColX[5],
        currentY + 4,
        { width: sessionColWidths[5] - 8, align: 'center' },
      );

      // Row divider
      doc.moveTo(pageMargin, currentY + sessionRowH).lineTo(pageMargin + contentWidth, currentY + sessionRowH)
        .strokeColor('#E2E8F0').lineWidth(0.5).stroke();

      currentY += sessionRowH;
    });

    // Session Table Summary Row
    if (currentY + 16 > maxContentY) {
      doc.addPage();
      doc.rect(0, 0, pageWidth, 5).fill('#059669');
      currentY = 40;
    }

    doc.rect(pageMargin, currentY, contentWidth, 16).fill('#ECFDF5');
    doc.fillColor('#065F46').fontSize(7).font('Helvetica-Bold').text(
      'TOTAL CUMULATIVE WORKING HOURS',
      sessionColX[0],
      currentY + 4.5,
      { width: 300 },
    );
    doc.fillColor('#047857').fontSize(8).font('Helvetica-Bold').text(
      formatHours(data.totalHoursInRevCycle),
      sessionColX[5],
      currentY + 4,
      { width: sessionColWidths[5] - 8, align: 'center' },
    );

    doc.moveTo(pageMargin, currentY + 16).lineTo(pageMargin + contentWidth, currentY + 16)
      .strokeColor('#10B981').lineWidth(1).stroke();
  }

  // 8. FOOTER BAR (Rendered on all pages using bufferPages)
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = 790;
    doc.moveTo(pageMargin, footerY).lineTo(pageMargin + contentWidth, footerY)
      .strokeColor('#E2E8F0').lineWidth(0.5).stroke();

    doc.fillColor('#94A3B8').fontSize(6.5).font('Helvetica').text(
      'AjraSakha System • Confidential Individual Activity Report',
      pageMargin,
      footerY + 6,
      { width: 300 },
    );

    doc.fillColor('#94A3B8').fontSize(6.5).font('Helvetica').text(
      `Page ${i + 1} of ${range.count}`,
      pageMargin + contentWidth - 100,
      footerY + 6,
      { width: 100, align: 'right' },
    );
  }

  doc.end();
  return pdfPromise;
}
