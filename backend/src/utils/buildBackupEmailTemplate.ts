import {DailyStats, IReviewWiseStats} from './getDailyStats.js';

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
//////////////////////////////////////////////////// FOR BACKUP MAIL /////////////////////////////////////////////////////////
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
        <td style="text-align: right;"><strong>${stats.totalQuestions}</strong></td>
      </tr>
      <tr style="border-top: 1px solid #eee;">
        <td>Waiting for Moderator Approval</td>
        <td style="text-align: right;"><strong>${stats.totalInReviewQuestions}</strong></td>
      </tr>
      <tr style="border-top: 1px solid #eee;">
        <td>Total Golden Dataset Entries</td>
        <td style="text-align: right;"><strong>${stats.totalClosedQuestions}</strong></td>
      </tr>
    </tbody>
  </table>
`;

// export const buildDailyStatsEmailTemplate = (stats?: DailyStats) => {
//   const today = new Date();

//   const dayName = today.toLocaleDateString('en-US', {weekday: 'long'}); // Monday, Tuesday...
//   const dateFormatted = today.toLocaleDateString('en-US', {
//     year: 'numeric',
//     month: 'long',
//     day: 'numeric',
//   }); // December 5, 2025

//   return `
//     <div style="max-width: 600px; margin: 0 auto; padding: 20px;
//       border: 1px solid #e0e0e0; border-radius: 8px;
//       font-family: Arial, sans-serif; line-height: 1.6;">

//       <h2 style="color:#1f2937; text-align: center;
//         border-bottom: 2px solid #1f2937;
//         padding-bottom: 10px; margin-bottom: 20px;">
//         📊 Daily Question Review System Summary
//       </h2>

//       <div style="background-color:#eef2ff; padding: 12px; border-radius: 6px; margin-bottom: 20px;">
//       <p style="margin: 4px 0;"><strong>🗓️ Date:</strong> ${dateFormatted}</p>
//       <p style="margin: 4px 0;"><strong>📅 Day:</strong> ${dayName}</p>
//       </div>

//       ${
//         stats
//           ? `
//             ${buildOverallSystemStatsTable(stats)}
//             <br/>
//             ${buildReviewWiseStatsTable(stats.reviewWiseCount)}
//             <br/>
//             ${buildTodayStatsTable(stats)}
//           `
//           : `
//             <p style="padding: 10px; background-color: #fef3c7;
//               border: 1px solid #fde68a; border-radius: 4px;">
//               ⚠️ No statistics available for today.
//             </p>
//           `
//       }

//       <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;"/>

//       <p style="font-size: 0.9em; color: #666;">
//         Regards,<br/>Ajraskha Analytics System
//       </p>
//     </div>
//   `;
// };
// //////////////////////////////////////////////////// FOR STATS MAIL /////////////////////////////////////////////////////////
// export const buildOverallSystemStatsTable = (stats: DailyStats) => `
//   <table border="0" cellpadding="10" cellspacing="0"
//     style="width: 100%; border-collapse: collapse; font-family: Arial; margin-top: 15px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
//     <thead style="background-color:#e5e7eb;">
//       <tr>
//         <th colspan="2" style="padding: 12px; text-align: left; color: #333; font-size: 1.1em;">
//           📌 Overall System Stats
//         </th>
//       </tr>
//     </thead>
//     <tbody>
//       <tr style="border-top: 1px solid #eee;">
//         <td>Total Questions in System</td>
//         <td style="text-align: right;"><strong>${
//           stats.totalQuestions
//         }</strong></td>
//       </tr>

//       <tr style="border-top: 1px solid #eee;">
//         <td>Waiting for Moderator Approval</td>
//         <td style="text-align: right;"><strong>${
//           stats.totalInReviewQuestions
//         }</strong></td>
//       </tr>

//       <tr style="border-top: 1px solid #eee;">
//         <td>Questions Under Expert Review</td>
//         <td style="text-align: right;"><strong>${
//           stats.totalQuestionsUnderExpertReview
//         }</strong></td>
//       </tr>

//       <tr style="border-top: 1px solid #eee;">
//         <td>Moderator Approval Rate</td>
//         <td style="text-align: right;">
//           <strong>${stats.moderatorApprovalRate.toFixed(2)}%</strong>
//         </td>
//       </tr>

//       <tr style="border-top: 1px solid #eee;">
//         <td>Total Golden Dataset Entries</td>
//         <td style="text-align: right;"><strong>${
//           stats.totalClosedQuestions
//         }</strong></td>
//       </tr>
//     </tbody>
//   </table>
// `;

// export const buildReviewWiseStatsTable = (
//   reviewWiseCount: IReviewWiseStats,
// ) => `
//   <table border="0" cellpadding="10" cellspacing="0"
//     style="width: 100%; border-collapse: collapse; font-family: Arial; margin-top: 15px;
//            border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">

//     <thead style="background-color:#e5e7eb;">
//       <tr>
//         <th colspan="2" style="padding: 12px; text-align: left; color: #333; font-size: 1.1em;">
//           🔍 Review-Wise Question Distribution
//         </th>
//       </tr>
//     </thead>

//     <tbody>
//       <tr><td>Author Level (Initial Submission)</td><td style="text-align:right;"><strong>${reviewWiseCount.authorLevel}</strong></td></tr>
//       <tr><td>Level 1 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelOne}</strong></td></tr>
//       <tr><td>Level 2 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelTwo}</strong></td></tr>
//       <tr><td>Level 3 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelThree}</strong></td></tr>
//       <tr><td>Level 4 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelFour}</strong></td></tr>
//       <tr><td>Level 5 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelFive}</strong></td></tr>
//       <tr><td>Level 6 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelSix}</strong></td></tr>
//       <tr><td>Level 7 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelSeven}</strong></td></tr>
//       <tr><td>Level 8 Review</td><td style="text-align:right;"><strong>${reviewWiseCount.levelEight}</strong></td></tr>
//       <tr><td>Level 9 (Reviewed & Closed)</td><td style="text-align:right;"><strong>${reviewWiseCount.levelNine}</strong></td></tr>
//     </tbody>
//   </table>
// `;

// export const buildTodayStatsTable = (stats: DailyStats) => `
//   <table border="0" cellpadding="10" cellspacing="0"
//     style="width: 100%; border-collapse: collapse; font-family: Arial; margin-top: 15px; border: 1px solid #ddd; border-radius: 6px; overflow: hidden;">
//     <thead style="background-color:#dbeafe;">
//       <tr>
//         <th colspan="2" style="padding: 12px; text-align: left; color: #333; font-size: 1.1em;">
//           📅 Today’s Stats
//         </th>
//       </tr>
//     </thead>
//     <tbody>
//       <tr style="border-top: 1px solid #eee;">
//         <td>Golden Dataset Entries Today</td>
//         <td style="text-align: right;"><strong>${stats.todayGolden}</strong></td>
//       </tr>
//       <tr style="border-top: 1px solid #eee;">
//         <td>Questions Added Today</td>
//         <td style="text-align: right;"><strong>${stats.todayAdded}</strong></td>
//       </tr>
//       <tr style="border-top: 1px solid #eee;">
//         <td>Chatbot-Generated Questions</td>
//         <td style="text-align: right;"><strong>${stats.chatbot}</strong></td>
//       </tr>
//       <tr style="border-top: 1px solid #eee;">
//         <td>Manually Added Questions</td>
//         <td style="text-align: right;"><strong>${stats.manual}</strong></td>
//       </tr>
//     </tbody>
//   </table>
// `;

export const buildDailyStatsEmailTemplate = (stats?: DailyStats) => {
  const today = new Date();

  const dayName = today.toLocaleDateString('en-US', {weekday: 'long'});
  const dateFormatted = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      
      <div style="width: 100%; margin: 0 auto; background-color: #ffffff;">
        
        <!-- Header -->
        <div style="padding: 40px 24px 32px 24px; text-align: center; border-bottom: 1px solid #e5e7eb;">
          <h1 style="color: #047857; margin: 0 0 8px 0; font-size: 28px; font-weight: 700; letter-spacing: -0.8px;">
            Daily Question Review System Report
          </h1>
          <p style="color: #6b7280; margin: 0; font-size: 15px; font-weight: 400;">
            ${dayName}, ${dateFormatted}
          </p>
        </div>

        <!-- Content -->
        <div style="padding: 32px 24px;">
          
          ${
            stats
              ? `
                ${buildOverallSystemStatsTable(stats)}
                <div style="height: 24px;"></div>
                ${buildReviewWiseStatsTable(stats.reviewWiseCount)}
                <div style="height: 24px;"></div>
                ${buildTodayStatsTable(stats)}
              `
              : `
                <div style="padding: 20px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                  <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                    <strong>Notice:</strong> No statistics are available for today. Please check back later or contact support if this issue persists.
                  </p>
                </div>
              `
          }

        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 24px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #374151; line-height: 1.6;">
            Best regards,<br/>
            <strong>Ajraskha Analytics System</strong>
          </p>
          <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
            This is an automated report. Please do not reply to this email.
          </p>
        </div>

      </div>

    </body>
    </html>
  `;
};

//////////////////////////////////////////////////// STATS TABLES /////////////////////////////////////////////////////////

export const buildOverallSystemStatsTable = (stats: DailyStats) => `
  <div style="border: 1px solid #e5e7eb;">
    <div style="background-color: #f9fafb; padding: 16px 20px; border-bottom: 2px solid #047857;">
      <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">
        System Overview
      </h2>
    </div>
    
    <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
      <tbody>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 16px 20px; font-size: 14px; color: #4b5563;">
            Total Questions in System
          </td>
          <td style="padding: 16px 20px; text-align: right; font-size: 14px; font-weight: 600; color: #1f2937;">
            ${stats.totalQuestions.toLocaleString()}
          </td>
        </tr>

        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 16px 20px; font-size: 14px; color: #4b5563;">
            Pending Moderator Approval
          </td>
          <td style="padding: 16px 20px; text-align: right; font-size: 14px; font-weight: 600; color: #1f2937;">
            ${stats.totalInReviewQuestions.toLocaleString()}
          </td>
        </tr>

        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 16px 20px; font-size: 14px; color: #4b5563;">
            Under Expert Review
          </td>
          <td style="padding: 16px 20px; text-align: right; font-size: 14px; font-weight: 600; color: #1f2937;">
            ${stats.totalQuestionsUnderExpertReview.toLocaleString()}
          </td>
        </tr>

        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 16px 20px; font-size: 14px; color: #4b5563;">
            Moderator Approval Rate
          </td>
          <td style="padding: 16px 20px; text-align: right; font-size: 14px; font-weight: 600; color: #059669;">
            ${stats.moderatorApprovalRate.toFixed(2)}%
          </td>
        </tr>

        <tr style="background-color: #f0fdf4;">
          <td style="padding: 16px 20px; font-size: 14px; color: #065f46; font-weight: 500;">
            Total Golden Dataset Entries
          </td>
          <td style="padding: 16px 20px; text-align: right;">
            <span style="display: inline-block; background-color: #059669; color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 15px; font-weight: 700;">
              ${stats.totalClosedQuestions.toLocaleString()}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
`;

export const buildReviewWiseStatsTable = (
  reviewWiseCount: IReviewWiseStats,
) => `
  <div style="border: 1px solid #e5e7eb;">
    <div style="background-color: #f9fafb; padding: 16px 20px; border-bottom: 2px solid #047857;">
      <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">
        Review Stage Distribution
      </h2>
    </div>
    
    <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
      <tbody>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Author Level (Initial Submission)</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.authorLevel.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 1 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelOne.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 2 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelTwo.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 3 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelThree.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 4 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelFour.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 5 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelFive.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 6 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelSix.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 7 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelSeven.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 8 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelEight.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">Level 9 Review</td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">${reviewWiseCount.levelNine.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

export const buildTodayStatsTable = (stats: DailyStats) => `
  <div style="border: 1px solid #e5e7eb;">
    <div style="background-color: #f9fafb; padding: 16px 20px; border-bottom: 2px solid #047857;">
      <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">
        Today's Activity
      </h2>
    </div>
    
    <table border="0" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
      <tbody>
        <tr style="border-bottom: 1px solid #f3f4f6; background-color: #f0fdf4;">
          <td style="padding: 16px 20px; font-size: 14px; color: #065f46; font-weight: 500;">
            Golden Dataset Entries Added Today
          </td>
          <td style="padding: 16px 20px; text-align: right;">
            <span style="display: inline-block; background-color: #047857; color: #ffffff; padding: 6px 12px; border-radius: 4px; font-size: 15px; font-weight: 700;">
              + ${stats.todayGolden.toLocaleString()}
            </span>
          </td>
        </tr>

        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px; font-size: 13px; color: #4b5563;">
            Total Questions Added
          </td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #1f2937;">
            ${stats.todayAdded.toLocaleString()}
          </td>
        </tr>

        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 14px 20px 14px 40px; font-size: 13px; color: #6b7280;">
            • Chatbot-Generated
          </td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #4b5563;">
            ${stats.chatbot.toLocaleString()}
          </td>
        </tr>

        <tr>
          <td style="padding: 14px 20px 14px 40px; font-size: 13px; color: #6b7280;">
            • Manually Added
          </td>
          <td style="padding: 14px 20px; text-align: right; font-size: 13px; font-weight: 600; color: #4b5563;">
            ${stats.manual.toLocaleString()}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
`;
