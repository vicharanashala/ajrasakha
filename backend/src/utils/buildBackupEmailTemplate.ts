import {DailyStats} from './getDailyStats.js';

export const buildBackupEmailTemplate = (
  timestamp: string,
  publicUrl: string,
  stats?: DailyStats,
) => {
  return `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; font-family: 'Arial', sans-serif; line-height: 1.6;">
      
      <h2 style="font-family: Arial; color:#16a34a; text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 10px; margin-bottom: 20px;">
        📊 Daily Question Review System Report
      </h2>

      <div style="background-color: #f7f7f7; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
        <p style="margin: 0;"><strong>Backup Completed:</strong> ${timestamp}</p>
        <p style="margin: 5px 0 0 0;">🔗 <a href="${publicUrl}" target="_blank" style="color: #16a34a; text-decoration: none;">View Backup File</a></p>
      </div>

      ${
        stats
          ? `
      <table border="0" cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: Arial; margin-top: 15px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
        <thead style="background-color:#e5e7eb;">
          <tr>
            <th colspan="2" style="padding: 12px; text-align: left; color: #333; font-size: 1.1em;">📌 Overall System Stats</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-top: 1px solid #eee;">
            <td style="width: 70%;">Total Questions in System</td>
            <td style="text-align: right; width: 30%;"><strong>${stats.total}</strong></td>
          </tr>
          <tr style="border-top: 1px solid #eee;">
            <td style="width: 70%;">Waiting for Moderator Approval</td>
            <td style="text-align: right; width: 30%;"><strong>${stats.waiting}</strong></td>
          </tr>
          <tr style="border-top: 1px solid #eee;">
            <td style="width: 70%;">Total Golden Dataset Entries</td>
            <td style="text-align: right; width: 30%;"><strong>${stats.totalGolden}</strong></td>
          </tr>
        </tbody>
      </table>

      <br/>

      <table border="0" cellpadding="10" cellspacing="0" style="width: 100%; border-collapse: collapse; font-family: Arial; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
        <thead style="background-color:#dbeafe;">
          <tr>
            <th colspan="2" style="padding: 12px; text-align: left; color: #333; font-size: 1.1em;">📅 Today’s Stats</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-top: 1px solid #eee;">
            <td style="width: 70%;">Golden Dataset Entries Today</td>
            <td style="text-align: right; width: 30%;"><strong>${stats.todayGolden}</strong></td>
          </tr>
          <tr style="border-top: 1px solid #eee;">
            <td style="width: 70%;">Questions Added Today</td>
            <td style="text-align: right; width: 30%;"><strong>${stats.todayAdded}</strong></td>
          </tr>
          <tr style="border-top: 1px solid #eee;">
            <td style="width: 70%;">Chatbot-Generated Questions</td>
            <td style="text-align: right; width: 30%;"><strong>${stats.chatbot}</strong></td>
          </tr>
          <tr style="border-top: 1px solid #eee;">
            <td style="width: 70%;">Manually Added Questions</td>
            <td style="text-align: right; width: 30%;"><strong>${stats.manual}</strong></td>
          </tr>
        </tbody>
      </table>
      `
          : `<p style="padding: 10px; background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 4px;">⚠️ No daily statistics available.</p>`
      }

      <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;"/>
      
      <p style="font-size: 0.9em; color: #666;">Thanks,<br/> Backup System</p>
    </div>
  `;
};
