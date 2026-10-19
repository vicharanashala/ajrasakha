import { emailConfig } from '#root/config/mail.js';
import { sendEmailWithAttachment } from './mailer.js';
import { annamLogoInlineAttachment } from './emailAssets.js';
import {
  generatePaeMilestonePdfReport,
  PaeExpertMilestoneData,
} from './buildPaeMilestonePdfReport.js';

export interface SendPaeMilestoneEmailOptions {
  data: PaeExpertMilestoneData;
  recipients?: string | string[];
}

/**
 * Generates the PAE milestone performance PDF report and sends it via email with attachment.
 */
export async function sendPaeMilestoneEmail(
  options: SendPaeMilestoneEmailOptions,
): Promise<{ success: boolean; message: string; recipients: string[] }> {
  try {
    const { data } = options;
    const { user, metrics } = data;
    const milestoneCount = metrics.milestoneCount;
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'PAE Expert';
    const sanitizedName = fullName.replace(/[^a-zA-Z0-9_-]/g, '_');

    // ─────────────────────────────────────────────────────────────
    // 1. RECIPIENT RESOLUTION
    // ─────────────────────────────────────────────────────────────
    let targetRecipients: string[] = [];

    if (options.recipients) {
      targetRecipients = Array.isArray(options.recipients)
        ? options.recipients
        : [options.recipients];
    } else {
      const configuredStr = emailConfig.PAE_MILESTONE_REPORT_EMAILS || '';
      targetRecipients = configuredStr
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
    }

    if (!targetRecipients.length) {
      console.warn(
        '[sendPaeMilestoneEmail] PAE_MILESTONE_REPORT_EMAILS is not configured; skipping email send.',
      );
      return {
        success: false,
        message: 'PAE_MILESTONE_REPORT_EMAILS is not configured; report was not sent',
        recipients: [],
      };
    }

    const ccRecipients = (emailConfig.PAE_MILESTONE_REPORT_CC || '')
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    // ─────────────────────────────────────────────────────────────
    // 2. GENERATE PDF REPORT BUFFER
    // ─────────────────────────────────────────────────────────────
    const pdfBuffer = await generatePaeMilestonePdfReport(data);
    const fileName = `PAE_Milestone_Report_${sanitizedName}_${milestoneCount}.pdf`;

    // ─────────────────────────────────────────────────────────────
    // 3. BUILD EMAIL HTML TEMPLATE
    // ─────────────────────────────────────────────────────────────
    const FONT =
      "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    const PAGE_BG = '#f3f6f4';
    const CARD_BG = '#ffffff';
    const BORDER = '#e5e7eb';
    const PRIMARY_SOFT = '#e8faf1';
    const PRIMARY_BORDER = '#bdeed4';
    const HEADING = '#14532d';
    const TEXT = '#171717';
    const MUTED = '#6b7280';
    const GREEN_ACCENT = '#059669';

    const stateDistrict = [user.preference?.state, user.preference?.district]
      .filter(Boolean)
      .join(', ') || 'All Regions';

    const emailSubject = `AjraSakha - PAE Milestone Report: ${fullName} Reached ${milestoneCount} Submissions`;

    const html = `
      <div style="background-color: ${PAGE_BG}; padding: 32px 16px; font-family: ${FONT}; color: ${TEXT}; font-size: 14px; line-height: 1.5;">
        <div style="max-width: 640px; margin: 0 auto; background-color: ${CARD_BG}; border-radius: 12px; overflow: hidden; border: 1px solid ${BORDER}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Brand Header -->
          <div style="padding: 24px 32px; background: linear-gradient(135deg, #14532d 0%, #1e3a29 100%); text-align: left;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="vertical-align: middle;">
                  <img src="cid:annam-logo" alt="Annam.ai" width="115" style="display: block; border: 0;" />
                </td>
                <td style="vertical-align: middle; text-align: right;">
                  <span style="display: inline-block; padding: 6px 12px; background-color: #10B981; color: #ffffff; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">
                    🎯 MILESTONE: ${milestoneCount} SUBMISSIONS
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <!-- Main Body -->
          <div style="padding: 32px;">
            <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: ${HEADING};">
              PAE Expert Milestone Achievement
            </h1>
            <p style="margin: 0 0 24px 0; font-size: 14px; color: ${MUTED};">
              <b>${fullName}</b> has successfully completed <b>${milestoneCount} submissions</b> in the AjraSakha review system.
            </p>

            <!-- Expert Profile Snippet Card -->
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px;">
              <h3 style="margin: 0 0 12px 0; font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px;">
                Expert Profile Summary
              </h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                  <td style="padding: 4px 0; color: ${MUTED}; width: 140px;"><b>Expert Name:</b></td>
                  <td style="padding: 4px 0; color: ${TEXT}; font-weight: 600;">${fullName}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: ${MUTED};"><b>Email Address:</b></td>
                  <td style="padding: 4px 0; color: ${TEXT};">${user.email || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: ${MUTED};"><b>Role:</b></td>
                  <td style="padding: 4px 0; color: ${TEXT};">Principal Agri Expert (PAE)</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: ${MUTED};"><b>University:</b></td>
                  <td style="padding: 4px 0; color: ${TEXT};">${user.university || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 0; color: ${MUTED};"><b>Region / District:</b></td>
                  <td style="padding: 4px 0; color: ${TEXT};">${stateDistrict}</td>
                </tr>
              </table>
            </div>

            <!-- Performance Metrics Grid (Card-like style table) -->
            <h3 style="margin: 0 0 14px 0; font-size: 14px; font-weight: 700; color: ${HEADING};">
              PAE Expert Performance Overview
            </h3>

            <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-left: -10px; margin-right: -10px; margin-bottom: 24px;">
              <tr>
                <td style="width: 50%; background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #d97706; border-radius: 6px; padding: 14px 16px;">
                  <div style="font-size: 11px; font-weight: 600; color: ${MUTED}; margin-bottom: 4px;">Assigned Questions</div>
                  <div style="font-size: 22px; font-weight: 700; color: ${TEXT};">${metrics.assignedCount}</div>
                  <div style="font-size: 10px; color: ${MUTED}; margin-top: 4px;">Total questions to answer</div>
                </td>
                <td style="width: 50%; background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 6px; padding: 14px 16px;">
                  <div style="font-size: 11px; font-weight: 600; color: ${MUTED}; margin-bottom: 4px;">Submitted Questions</div>
                  <div style="font-size: 22px; font-weight: 700; color: ${TEXT};">${metrics.submittedCount}</div>
                  <div style="font-size: 10px; color: ${GREEN_ACCENT}; margin-top: 4px;">Answers submitted by expert</div>
                </td>
              </tr>
              <tr>
                <td style="width: 50%; background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #dc2626; border-radius: 6px; padding: 14px 16px;">
                  <div style="font-size: 11px; font-weight: 600; color: ${MUTED}; margin-bottom: 4px;">Pending Questions</div>
                  <div style="font-size: 22px; font-weight: 700; color: ${TEXT};">${metrics.pendingCount}</div>
                  <div style="font-size: 10px; color: ${MUTED}; margin-top: 4px;">Assigned but not yet answered</div>
                </td>
                <td style="width: 50%; background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 6px; padding: 14px 16px;">
                  <div style="font-size: 11px; font-weight: 600; color: ${MUTED}; margin-bottom: 4px;">Feedback Assigned</div>
                  <div style="font-size: 22px; font-weight: 700; color: ${TEXT};">${metrics.feedbackAssigned}</div>
                  <div style="font-size: 10px; color: ${MUTED}; margin-top: 4px;">Validation reviews assigned</div>
                </td>
              </tr>
              <tr>
                <td style="width: 50%; background-color: #ecfdf5; border: 1.5px solid #059669; border-left: 4px solid #059669; border-radius: 6px; padding: 14px 16px;">
                  <div style="font-size: 11px; font-weight: 700; color: #047857; margin-bottom: 4px;">Feedback Completed</div>
                  <div style="font-size: 22px; font-weight: 700; color: #065f46;">${metrics.feedbackCompleted}</div>
                  <div style="font-size: 10px; font-weight: 600; color: #059669; margin-top: 4px;">Validations finished (Milestone)</div>
                </td>
                <td style="width: 50%; background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid #ea580c; border-radius: 6px; padding: 14px 16px;">
                  <div style="font-size: 11px; font-weight: 600; color: ${MUTED}; margin-bottom: 4px;">Feedback Pending</div>
                  <div style="font-size: 22px; font-weight: 700; color: ${TEXT};">${metrics.feedbackPending}</div>
                  <div style="font-size: 10px; color: ${MUTED}; margin-top: 4px;">Assigned reviews in queue</div>
                </td>
              </tr>
            </table>

            <!-- Attachment Note Banner -->
            <div style="background-color: ${PRIMARY_SOFT}; border: 1px solid ${PRIMARY_BORDER}; border-radius: 8px; padding: 14px 18px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: ${HEADING}; font-weight: 600;">
                📄 Official Performance PDF Report is attached: <span style="font-weight: 700;">${fileName}</span>
              </p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: ${MUTED};">
                Contains complete personal details, regional specialization, and validation breakdown.
              </p>
            </div>

            <p style="margin-top: 24px; font-size: 12px; color: ${MUTED}; line-height: 1.6; text-align: center;">
              This is an automated milestone notification from the AjraSakha Review System.
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: ${PRIMARY_SOFT}; padding: 18px 24px; text-align: center; font-size: 12px; color: ${MUTED}; border-top: 1px solid ${PRIMARY_BORDER};">
            <p style="margin: 0; color: ${TEXT};">Regards,</p>
            <p style="margin: 3px 0 0 0; color: ${HEADING}; font-weight: 700;">AjraSakha System</p>
            <p style="margin: 10px 0 0 0; font-size: 11px; color: ${MUTED};">&copy; ${new Date().getFullYear()} Annam.ai. All rights reserved.</p>
          </div>
        </div>
      </div>
    `;

    // ─────────────────────────────────────────────────────────────
    // 4. SEND EMAIL VIA NODEMAILER WITH ATTACHMENT
    // ─────────────────────────────────────────────────────────────
    await sendEmailWithAttachment(
      targetRecipients,
      emailSubject,
      html,
      pdfBuffer,
      fileName,
      'application/pdf',
      [annamLogoInlineAttachment()],
      ccRecipients.length ? ccRecipients : undefined,
    );

    console.log(
      `[sendPaeMilestoneEmail] Successfully sent ${milestoneCount}-milestone report for ${fullName} (${user.email}) to: ${targetRecipients.join(', ')}`,
    );

    return {
      success: true,
      message: `PAE milestone report sent to ${targetRecipients.join(', ')}`,
      recipients: targetRecipients,
    };
  } catch (error: any) {
    console.error('[sendPaeMilestoneEmail] Error sending PAE milestone email:', error);
    throw error;
  }
}
