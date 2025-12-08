import {DailyStats} from './getDailyStats.js';

export const buildBackupEmailTemplate = (
  timestamp: string,
  publicUrl: string,
  stats?: DailyStats,
) => {
  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; font-family: Arial; line-height: 1.6;">
      
      <h2 style="color:#16a34a; text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 10px; margin-bottom: 20px;">
        📊 Daily Question Review System Report
      </h2>

      <div style="background-color: #f7f7f7; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
        <p><strong>Backup Completed:</strong> ${timestamp}</p>
        <p style="margin-top: 5px;">
          🔗 <a href="${publicUrl}" target="_blank" style="color: #16a34a; text-decoration: none;">
            View Backup File
          </a>
        </p>
      </div>

      ${
        stats
          ? `
            ${buildOverallStatsTable(stats)}
            `
          : `<p style="padding: 10px; background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 4px;">
              ⚠️ No statistics available.
            </p>`
      }

      <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;"/>
      
      <p style="font-size: 0.9em; color: #666;">Thanks,<br/> Backup System</p>
    </div>
  `;
};

export const buildDailyStatsEmailTemplate = (stats?: DailyStats) => {
  const today = new Date();

  const dayName = today.toLocaleDateString('en-US', {weekday: 'long'}); // Monday, Tuesday...
  const dateFormatted = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }); // December 5, 2025

  const weekNumber = Math.ceil((today.getDate() - today.getDay() + 1) / 7); // Simple week number calc

  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;
      border: 1px solid #e0e0e0; border-radius: 8px;
      font-family: Arial, sans-serif; line-height: 1.6;">
      
      <h2 style="color:#1f2937; text-align: center;
        border-bottom: 2px solid #1f2937;
        padding-bottom: 10px; margin-bottom: 20px;">
        📊 Daily Question Review System Summary
      </h2>

      <div style="background-color:#eef2ff; padding: 12px; border-radius: 6px; margin-bottom: 20px;">
      <p style="margin: 4px 0;"><strong>🗓️ Date:</strong> ${dateFormatted}</p>
      <p style="margin: 4px 0;"><strong>📅 Day:</strong> ${dayName}</p>
      </div>

      ${
        stats
          ? `
            ${buildOverallStatsTable(stats)}
            <br/>
            ${buildTodayStatsTable(stats)}
          `
          : `
            <p style="padding: 10px; background-color: #fef3c7;
              border: 1px solid #fde68a; border-radius: 4px;">
              ⚠️ No statistics available for today.
            </p>
          `
      }

      <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;"/>
      
      <p style="font-size: 0.9em; color: #666;">
        Regards,<br/>Ajraskha Analytics System
      </p>
    </div>
  `;
};

export const buildOverallStatsTable = (stats: DailyStats) => `
  <table border="0" cellpadding="10" cellspacing="0"
    style="width: 100%; border-collapse: collapse; font-family: Arial; margin-top: 15px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
    <thead style="background-color:#e5e7eb;">
      <tr>
        <th colspan="2" style="padding: 12px; text-align: left; color: #333; font-size: 1.1em;">
          📌 Overall System Stats
        </th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-top: 1px solid #eee;">
        <td>Total Questions in System</td>
        <td style="text-align: right;"><strong>${stats.total}</strong></td>
      </tr>
      <tr style="border-top: 1px solid #eee;">
        <td>Waiting for Moderator Approval</td>
        <td style="text-align: right;"><strong>${stats.waiting}</strong></td>
      </tr>
      <tr style="border-top: 1px solid #eee;">
        <td>Total Golden Dataset Entries</td>
        <td style="text-align: right;"><strong>${stats.totalGolden}</strong></td>
      </tr>
    </tbody>
  </table>
`;

export const buildTodayStatsTable = (stats: DailyStats) => `
  <table border="0" cellpadding="10" cellspacing="0"
    style="width: 100%; border-collapse: collapse; font-family: Arial; margin-top: 15px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
    <thead style="background-color:#dbeafe;">
      <tr>
        <th colspan="2" style="padding: 12px; text-align: left; color: #333; font-size: 1.1em;">
          📅 Today’s Stats
        </th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-top: 1px solid #eee;">
        <td>Golden Dataset Entries Today</td>
        <td style="text-align: right;"><strong>${stats.todayGolden}</strong></td>
      </tr>
      <tr style="border-top: 1px solid #eee;">
        <td>Questions Added Today</td>
        <td style="text-align: right;"><strong>${stats.todayAdded}</strong></td>
      </tr>
      <tr style="border-top: 1px solid #eee;">
        <td>Chatbot-Generated Questions</td>
        <td style="text-align: right;"><strong>${stats.chatbot}</strong></td>
      </tr>
      <tr style="border-top: 1px solid #eee;">
        <td>Manually Added Questions</td>
        <td style="text-align: right;"><strong>${stats.manual}</strong></td>
      </tr>
    </tbody>
  </table>
`;
