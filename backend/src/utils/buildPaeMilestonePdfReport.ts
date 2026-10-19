import PDFDocument from 'pdfkit';
import { annamLogoInlineAttachment } from './emailAssets.js';

export interface PaeExpertMilestoneData {
  user: {
    _id: string;
    firstName: string;
    lastName?: string;
    email: string;
    mobile?: string;
    role?: string;
    university?: string;
    preference?: {
      state?: string;
      district?: string;
      crop?: string;
      domain?: string | string[];
    } | null;
    kvkCovered?: { state?: string; district?: string; name?: string }[] | null;
    createdAt?: Date;
    lastCheckInAt?: Date;
  };
  metrics: {
    milestoneCount: number;
    assignedCount: number;
    submittedCount: number;
    pendingCount: number;
    feedbackAssigned: number;
    feedbackCompleted: number;
    feedbackPending: number;
  };
  generatedAt?: Date;
}

/**
 * Builds a styled, card-based PDF performance report for a PAE Expert milestone.
 */
export async function generatePaeMilestonePdfReport(
  data: PaeExpertMilestoneData,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    info: {
      Title: `PAE Milestone Report - ${data.user.firstName} ${data.user.lastName ?? ''}`.trim(),
      Author: 'AjraSakha System',
      Subject: `PAE Expert Milestone Report - ${data.metrics.milestoneCount} Submissions`,
      CreationDate: data.generatedAt || new Date(),
    },
  });

  const buffers: Buffer[] = [];
  doc.on('data', buffers.push.bind(buffers));

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });

  const now = data.generatedAt || new Date();
  const formattedDate = now.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fullName = `${data.user.firstName ?? ''} ${data.user.lastName ?? ''}`.trim() || 'PAE Expert';
  const roleLabel = data.user.role === 'pae_expert' ? 'Principal Agri Expert (PAE)' : (data.user.role || 'PAE Expert');
  const university = data.user.university || 'Not Specified';
  const stateDistrict = [data.user.preference?.state, data.user.preference?.district].filter(Boolean).join(', ') || 'All Regions';
  
  let domainStr = 'All Domains';
  if (Array.isArray(data.user.preference?.domain)) {
    domainStr = data.user.preference.domain.join(', ');
  } else if (typeof data.user.preference?.domain === 'string') {
    domainStr = data.user.preference.domain;
  }

  const crop = data.user.preference?.crop || 'All Crops';
  
  let kvkStr = 'None';
  if (Array.isArray(data.user.kvkCovered) && data.user.kvkCovered.length > 0) {
    kvkStr = data.user.kvkCovered.map(k => k.name || `${k.district || ''} ${k.state || ''}`.trim()).filter(Boolean).slice(0, 3).join(', ');
    if (data.user.kvkCovered.length > 3) kvkStr += ` (+${data.user.kvkCovered.length - 3} more)`;
  }

  const memberSince = data.user.createdAt
    ? new Date(data.user.createdAt).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'N/A';

  // ─────────────────────────────────────────────────────────────
  // 1. TOP ACCENT BAR
  // ─────────────────────────────────────────────────────────────
  doc.rect(0, 0, 595.28, 6).fill('#14532D');

  // ─────────────────────────────────────────────────────────────
  // 2. HEADER: LOGO & TITLES
  // ─────────────────────────────────────────────────────────────
  try {
    const logoBuffer = annamLogoInlineAttachment().content;
    doc.image(logoBuffer, 36, 22, { width: 105 });
  } catch {
    doc.fillColor('#14532D').fontSize(16).font('Helvetica-Bold').text('ANNAM.AI', 36, 26);
  }

  doc.fillColor('#14532D').fontSize(16).font('Helvetica-Bold').text('PAE EXPERT MILESTONE REPORT', 150, 22, {
    width: 409,
    align: 'right',
  });

  doc.fillColor('#64748B').fontSize(8.5).font('Helvetica').text('AjraSakha Question & Review Management System', 150, 42, {
    width: 409,
    align: 'right',
  });

  doc.fillColor('#64748B').fontSize(8).font('Helvetica').text(`Generated: ${formattedDate} IST`, 150, 54, {
    width: 409,
    align: 'right',
  });

  // ─────────────────────────────────────────────────────────────
  // 3. MILESTONE BADGE BANNER
  // ─────────────────────────────────────────────────────────────
  const bannerY = 72;
  doc.roundedRect(36, bannerY, 523.28, 38, 6).fillAndStroke('#ECFDF5', '#10B981');

  doc.fillColor('#065F46').fontSize(12).font('Helvetica-Bold').text(
    `MILESTONE ACHIEVED: ${data.metrics.milestoneCount} SUBMISSIONS COMPLETED`,
    46,
    bannerY + 7,
    { width: 503.28, align: 'center' },
  );

  doc.fillColor('#047857').fontSize(8).font('Helvetica').text(
    `Recognizing excellence in Principal Agri Expert (PAE) verification & content quality`,
    46,
    bannerY + 23,
    { width: 503.28, align: 'center' },
  );

  // ─────────────────────────────────────────────────────────────
  // 4. PAE PERSONAL & PROFILE DETAILS CARD
  // ─────────────────────────────────────────────────────────────
  const profileY = 118;
  const profileH = 136;
  doc.roundedRect(36, profileY, 523.28, profileH, 6).fillAndStroke('#F8FAFC', '#CBD5E1');

  // Profile Header Strip
  doc.roundedRect(36, profileY, 523.28, 22, 6).fill('#0F172A');
  doc.rect(36, profileY + 12, 523.28, 10).fill('#0F172A'); // flatten bottom corners of header
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text(
    'PAE EXPERT PROFILE & AFFILIATION',
    46,
    profileY + 6,
  );

  // Key-Value Rows (2 Columns)
  const col1X = 48;
  const col1ValX = 120;
  const col2X = 300;
  const col2ValX = 385;
  let py = profileY + 30;
  const rowSpacing = 19;

  const drawField = (label: string, value: string, lx: number, vx: number, y: number, maxW = 160) => {
    doc.fillColor('#64748B').fontSize(8).font('Helvetica-Bold').text(label, lx, y);
    doc.fillColor('#0F172A').fontSize(8).font('Helvetica').text(value, vx, y, {
      width: maxW,
      lineBreak: false,
      ellipsis: true,
    });
  };

  // Row 1
  drawField('Expert Name:', fullName, col1X, col1ValX, py, 170);
  drawField('State / District:', stateDistrict, col2X, col2ValX, py, 160);

  // Row 2
  py += rowSpacing;
  drawField('Email Address:', data.user.email || 'N/A', col1X, col1ValX, py, 170);
  drawField('Preferred Crop:', crop, col2X, col2ValX, py, 160);

  // Row 3
  py += rowSpacing;
  drawField('Mobile / Phone:', data.user.mobile || 'N/A', col1X, col1ValX, py, 170);
  drawField('Domain / Topic:', domainStr, col2X, col2ValX, py, 160);

  // Row 4
  py += rowSpacing;
  drawField('Assigned Role:', roleLabel, col1X, col1ValX, py, 170);
  drawField('KVKs Covered:', kvkStr, col2X, col2ValX, py, 160);

  // Row 5
  py += rowSpacing;
  drawField('University:', university, col1X, col1ValX, py, 170);
  drawField('Member Since:', memberSince, col2X, col2ValX, py, 160);

  // ─────────────────────────────────────────────────────────────
  // 5. PAE EXPERT PERFORMANCE (CARD-LIKE STYLE)
  // ─────────────────────────────────────────────────────────────
  const perfSecY = 264;
  doc.fillColor('#0F172A').fontSize(11).font('Helvetica-Bold').text(
    'PAE EXPERT PERFORMANCE OVERVIEW',
    36,
    perfSecY,
  );
  doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(
    'Live performance analytics metrics referenced from User Management and Validation Queues',
    36,
    perfSecY + 14,
  );

  const cardW = 166;
  const cardH = 82;
  const colGap = 12.6;
  const rowGap = 10;
  const gridX = 36;
  const row1Y = 292;
  const row2Y = row1Y + cardH + rowGap;

  interface MetricCardConfig {
    title: string;
    value: number;
    subtext: string;
    accentColor: string;
    isHighlight?: boolean;
  }

  const metricCards: MetricCardConfig[] = [
    {
      title: 'Assigned Questions',
      value: data.metrics.assignedCount,
      subtext: 'Total questions to answer',
      accentColor: '#D97706',
    },
    {
      title: 'Submitted Questions',
      value: data.metrics.submittedCount,
      subtext: 'Answers submitted by expert',
      accentColor: '#059669',
    },
    {
      title: 'Pending Questions',
      value: data.metrics.pendingCount,
      subtext: 'Assigned but not yet answered',
      accentColor: '#DC2626',
    },
    {
      title: 'Feedback Assigned',
      value: data.metrics.feedbackAssigned,
      subtext: 'Validation reviews assigned',
      accentColor: '#2563EB',
    },
    {
      title: 'Feedback Completed',
      value: data.metrics.feedbackCompleted,
      subtext: 'Validations finished (Milestone)',
      accentColor: '#059669',
      isHighlight: true,
    },
    {
      title: 'Feedback Pending',
      value: data.metrics.feedbackPending,
      subtext: 'Assigned reviews in queue',
      accentColor: '#EA580C',
    },
  ];

  const drawMetricCard = (card: MetricCardConfig, x: number, y: number) => {
    const bg = card.isHighlight ? '#ECFDF5' : '#FFFFFF';
    const border = card.isHighlight ? '#059669' : '#E2E8F0';
    const borderW = card.isHighlight ? 1.5 : 1;

    doc.lineWidth(borderW).roundedRect(x, y, cardW, cardH, 6).fillAndStroke(bg, border);

    // Left accent pill / indicator
    doc.roundedRect(x + 10, y + 10, 4, cardH - 20, 2).fill(card.accentColor);

    // Card Title
    doc.fillColor(card.isHighlight ? '#047857' : '#475569')
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text(card.title, x + 20, y + 12, { width: cardW - 28 });

    // Card Value
    doc.fillColor(card.isHighlight ? '#065F46' : '#0F172A')
      .fontSize(21)
      .font('Helvetica-Bold')
      .text(String(card.value ?? 0), x + 20, y + 27, { width: cardW - 28 });

    // Subtext
    doc.fillColor(card.isHighlight ? '#059669' : '#64748B')
      .fontSize(7)
      .font('Helvetica')
      .text(card.subtext, x + 20, y + 58, { width: cardW - 28 });
  };

  // Draw Grid of 6 Cards
  metricCards.forEach((card, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const cx = gridX + col * (cardW + colGap);
    const cy = row === 0 ? row1Y : row2Y;
    drawMetricCard(card, cx, cy);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. PERFORMANCE SUMMARY & RATIOS BAR
  // ─────────────────────────────────────────────────────────────
  const summaryY = 478;
  doc.lineWidth(1).roundedRect(36, summaryY, 523.28, 54, 6).fillAndStroke('#F8FAFC', '#CBD5E1');

  const ansRate = data.metrics.assignedCount > 0
    ? Math.round((data.metrics.submittedCount / data.metrics.assignedCount) * 100)
    : 0;

  const fbRate = data.metrics.feedbackAssigned > 0
    ? Math.round((data.metrics.feedbackCompleted / data.metrics.feedbackAssigned) * 100)
    : 0;

  const totalActions = (data.metrics.submittedCount || 0) + (data.metrics.feedbackCompleted || 0);

  const drawSummaryMetric = (label: string, val: string, sub: string, sx: number) => {
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica-Bold').text(label, sx, summaryY + 8, {
      width: 155,
      align: 'center',
    });
    doc.fillColor('#14532D').fontSize(14).font('Helvetica-Bold').text(val, sx, summaryY + 20, {
      width: 155,
      align: 'center',
    });
    doc.fillColor('#64748B').fontSize(6.5).font('Helvetica').text(sub, sx, summaryY + 38, {
      width: 155,
      align: 'center',
    });
  };

  drawSummaryMetric('Answer Submission Rate', `${ansRate}%`, 'Completed answers vs assigned', 46);
  doc.moveTo(210, summaryY + 8).lineTo(210, summaryY + 46).strokeColor('#CBD5E1').stroke();

  drawSummaryMetric('Validation Completion Rate', `${fbRate}%`, 'Completed reviews vs assigned', 220);
  doc.moveTo(384, summaryY + 8).lineTo(384, summaryY + 46).strokeColor('#CBD5E1').stroke();

  drawSummaryMetric('Total Content Actions', `${totalActions}`, 'Answers + Validations combined', 394);

  // ─────────────────────────────────────────────────────────────
  // 7. QUALITY STATEMENT & SYSTEM VERIFICATION
  // ─────────────────────────────────────────────────────────────
  const noteY = 544;
  doc.lineWidth(1).roundedRect(36, noteY, 523.28, 172, 6).fillAndStroke('#FFFFFF', '#E2E8F0');

  // Header banner inside note
  doc.roundedRect(36, noteY, 523.28, 20, 6).fill('#F1F5F9');
  doc.rect(36, noteY + 10, 523.28, 10).fill('#F1F5F9');
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text(
    'MILESTONE VERIFICATION & PLATFORM IMPACT',
    46,
    noteY + 6,
  );

  const noteText = [
    `• Milestone Trigger: This automated report was generated upon ${fullName} successfully reaching ${data.metrics.milestoneCount} validated question submissions in the AjraSakha review pipeline.`,
    `• Role Significance: Principal Agri Experts (PAEs) ensure that all farmer-facing agricultural answers meet the highest scientific accuracy, regional relevance, and language clarity standards.`,
    `• Data Integrity: All metrics documented herein are extracted in real-time from the immutable question submission logs and PAE validation history collections.`,
    `• Workload Allocation: Completed reviews are automatically logged, freeing up capacity for new incoming farmer inquiries across the registered KVKs and domains.`,
  ];

  let ny = noteY + 28;
  noteText.forEach(bullet => {
    doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(bullet, 46, ny, {
      width: 503.28,
      lineGap: 3,
    });
    ny += 28;
  });

  // Milestone Stamp badge in the note
  doc.roundedRect(390, noteY + 124, 155, 36, 4).fillAndStroke('#F0FDF4', '#10B981');
  doc.fillColor('#047857').fontSize(8).font('Helvetica-Bold').text(
    'VERIFIED MILESTONE',
    390,
    noteY + 130,
    { width: 155, align: 'center' },
  );
  doc.fillColor('#065F46').fontSize(11).font('Helvetica-Bold').text(
    `${data.metrics.milestoneCount} SUBMISSIONS`,
    390,
    noteY + 141,
    { width: 155, align: 'center' },
  );

  // ─────────────────────────────────────────────────────────────
  // 8. FOOTER
  // ─────────────────────────────────────────────────────────────
  const footerY = 730;
  doc.moveTo(36, footerY).lineTo(559.28, footerY).strokeColor('#CBD5E1').lineWidth(0.8).stroke();

  doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(
    'Confidential • AjraSakha Automated Review System • © 2026 Annam.ai. All rights reserved.',
    36,
    footerY + 8,
  );

  doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(
    'Page 1 of 1',
    450,
    footerY + 8,
    { width: 109.28, align: 'right' },
  );

  doc.end();
  return pdfPromise;
}
