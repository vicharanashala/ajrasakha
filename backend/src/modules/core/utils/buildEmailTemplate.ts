import { appConfig } from "#root/config/app.js";
import { IQuestion, ISubmissionHistory, IUser } from "#root/shared/index.js";
import { calculateHoursSince } from "./calculateHoursSince.js";


export const buildTimeline = (
  history: ISubmissionHistory[],
  userId: string,
  users: IUser[],
) => {
  if (!history || history.length <= 1) return '';

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getUserName = (updatedById?: string): string => {
    if (!updatedById) return 'System';
    const user = users.find(u => u._id.toString() === updatedById.toString());
    return user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
  };

  const getStatusColor = (status: string): string => {
    const statusColors: {[key: string]: string} = {
      approved: '#10B981',
      rejected: '#EF4444',
      pending: '#F59E0B',
      'in-review': '#3B82F6',
      submitted: '#6366F1',
    };
    return statusColors[status.toLowerCase()] || '#6B7280';
  };

  const getStatusLabel = (status: string): string => {
    return status
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

    return `
    <div style="margin-top: 32px; padding: 20px; background: #F9FAFB; border-radius: 8px;">
    <h3 style="margin: 0 0 20px 0; color: #111827; font-size: 16px; font-weight: 600;">
        📋 Activity Timeline
    </h3>

    <table style="border-collapse: collapse; width: 100%;">
        ${history
        .map((h, index) => {
            const isLast = index === history.length - 1;
            const isCurrentUser = h.updatedBy?.toString?.() === userId.toString();
            const statusColor = getStatusColor(h.status);
            const userName = getUserName(h.updatedBy.toString());

            return `
            <!-- TIMELINE ROW -->
            <tr>
            <!-- Dot + Line -->
            <td style="width: 40px; vertical-align: top; text-align: center;">

                <!-- Dot -->
                <div style="
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: ${statusColor};
                border: 3px solid #ffffff;
                margin: 4px auto;
                box-shadow: 0 0 0 2px ${statusColor}33;
                ${isLast ? 'animation:pulse 2s infinite;' : ''}
                "></div>

                <!-- Line -->
                ${
                !isLast
                    ? `
                <div style="
                width: 2px;
                height: 40px;
                background: linear-gradient(to bottom, ${statusColor}40, #E5E7EB);
                margin: 0 auto;
                "></div>
                `
                    : ''
                }

            </td>

            <!-- Content Card -->
            <td style="padding-bottom: 28px;">
                <div style="
                background: #ffffff;
                padding: 16px;
                border-radius: 8px;
                border: 1px solid ${isLast ? statusColor + '40' : '#E5E7EB'};
                ">

                <!-- Header -->
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                    <td>
                        <span style="
                        background: ${statusColor}15;
                        padding: 4px 12px;
                        color: ${statusColor};
                        border-radius: 12px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                        ">
                        ${getStatusLabel(h.status)}
                        </span>
                    </td>

                    ${
                        isLast
                        ? `
                        <td style="text-align: right;">
                        <span style="
                            padding: 4px 8px;
                            background: #3ecf81;
                            color: white;
                            border-radius: 4px;
                            font-size: 10px;
                            font-weight: 600;
                            text-transform: uppercase;
                        ">
                            LATEST
                        </span>
                        </td>`
                        : ''
                    }
                    </tr>
                </table>

                <!-- User -->
                <div style="margin: 8px 0;">
                    <span style="font-size: 14px; color: #374151; font-weight: 500;">
                    ${userName}
                    </span>
                    ${
                    isCurrentUser
                        ? `
                    <span style="
                        padding: 2px 8px;
                        background: #6366F1;
                        color: white;
                        border-radius: 10px;
                        font-size: 11px;
                        font-weight: 600;
                        margin-left: 8px;
                    ">
                        YOU
                    </span>
                    `
                        : ''
                    }
                </div>

                <!-- Date -->
                <div style="font-size: 13px; color: #6B7280; margin-bottom: ${
                    h.reasonForRejection ? '12px' : '0'
                };">
                    🗓️ ${formatDate(h.createdAt)}
                </div>

                <!-- Rejection Reason -->
                ${
                    h.reasonForRejection
                    ? `
                    <div style="
                    margin-top: 12px;
                    padding: 12px;
                    background: #FEF2F2;
                    border-left: 3px solid #EF4444;
                    border-radius: 4px;
                    ">
                    <div style="font-size: 12px; color: #991B1B; font-weight: 600;">
                        Reason for Rejection:
                    </div>
                    <div style="font-size: 13px; color: #7F1D1D;">
                        ${h.reasonForRejection}
                    </div>
                    </div>
                `
                    : ''
                }

                </div>
            </td>
            </tr>
            `;
        })
        .join('')}
    </table>
    </div>

    <style>
    @keyframes pulse {
    0%,100% { box-shadow: 0 0 0 2px ${getStatusColor(
        history[history.length - 1].status,
    )}33; }
    50% { box-shadow: 0 0 0 6px ${getStatusColor(
        history[history.length - 1].status,
    )}11; }
    }
    </style>
    `;

};

export const buildEmailTemplate = (
  type: string,
  user: IUser,
  question: IQuestion,
  history: ISubmissionHistory[],
  title: string,
  message: string,
  allUsers: IUser[] = [],
) => {
  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .map(s => s[0].toUpperCase() + s.slice(1).toLowerCase())
    .join(' ') || "Unknown user";

  const timelineHTML =
    type !== 'new_comment' && history.length > 1
      ? buildTimeline(history, user._id.toString(), allUsers)
      : '';

  let timeBlock = '';
  const {remaining, remainingMs} = calculateHoursSince(question.createdAt);

  if (question.status !== 'open') {
    const hoursPassed = Math.floor(
      (Date.now() - new Date(question.createdAt).getTime()) / (1000 * 60 * 60),
    );

    timeBlock = `
    <div style="
      background: #FEF3C7;
      border-left: 4px solid #F59E0B;
      padding: 16px;
      border-radius: 6px;
      margin: 20px 0;
    ">
      <p style="margin: 0; font-size: 14px; color: #92400E; font-weight: 600;">
        ⏰ Time Sensitive
      </p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #78350F;">
        This question was created <strong>${hoursPassed} hour(s) ago</strong>.
      </p>
    </div>
  `;
  } else if (remaining && remainingMs > 0) {
    timeBlock = `
    <div style="
      background: #EFF6FF;
      border-left: 4px solid #3B82F6;
      padding: 16px;
      border-radius: 6px;
      margin: 20px 0;
    ">
      <p style="margin: 0; font-size: 14px; color: #1D4ED8; font-weight: 600;">
        ⏳ Time Remaining
      </p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #1E3A8A;">
        <strong>${remaining.hrs}h ${remaining.mins}m</strong> left to complete the review (SLA: 4 hours).
      </p>
    </div>
  `;
  } else {
    timeBlock = `
    <div style="
      background: #FEE2E2;
      border-left: 4px solid #EF4444;
      padding: 16px;
      border-radius: 6px;
      margin: 20px 0;
    ">
      <p style="margin: 0; font-size: 14px; color: #B91C1C; font-weight: 600;">
        ⚠️ Delayed Submission
      </p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #7F1D1D;">
        The allowed 4-hour review window has passed.
      </p>
    </div>
  `;
  }

  const button = (label: string, link: string) => `
    <a 
      href="${link}" 
      style="
        display: inline-block;
        margin-top: 24px;
        padding: 14px 28px;
        background: #3ecf81;
        color: white;
        text-decoration: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 600;
        transition: all 0.3s ease;
      "
      target="_blank"
    >
      ${label} →
    </a>
  `;

  const footer = `
    <div style="
      margin-top: 32px;
      padding-top: 24px;
      border-top: 2px solid #E5E7EB;
    ">
      <p style="font-size: 13px; color: #6B7280; margin: 0 0 8px 0; line-height: 1.6;">
        This is an automated notification from your reviewer system.
      </p>
      <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
        Please do not reply to this email. For support, visit your dashboard.
      </p>
    </div>
  `;

  let mainBody = '';
  let headerColor = '#6366F1';
  let headerIcon = '📝';

  if (type === 'answer_creation' || type === 'peer_review') {
    const hours = Math.floor(
      (Date.now() - new Date(question.createdAt).getTime()) / (1000 * 60 * 60),
    );

    headerColor = '#000000ff';
    headerIcon = '✅';

    mainBody = `
      <div style="margin-bottom: 32px;">
        <h2 style="margin: 0; color: ${headerColor}; font-size: 24px; font-weight: 700;">
          New Task Assigned
        </h2>
      </div>

      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Hello <strong style="color: #111827;">${fullName}</strong>,
      </p>

        ${timeBlock}

      <div style="
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        padding: 20px;
        margin: 24px 0;
      ">
        <div style="font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">
          Question
        </div>
        <div style="font-size: 15px; color: #111827; line-height: 1.6;">
          ${question.question}
        </div>
      </div>

      ${timelineHTML}

      <div style="text-align: center;">
        ${button('Open Dashboard', appConfig.origins + `/home?question=${question._id.toString()}`)}
      </div>
    `;
  } else if (type === 'new_comment') {
    headerColor = '#3B82F6';
    headerIcon = '💬';

    mainBody = `
      <div style=" margin-bottom: 32px;">
        <div style="
          display: inline-block;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          font-size: 32px;
          line-height: 64px;
          margin-bottom: 16px;
        ">
          ${headerIcon}
        </div>
        <h2 style="margin: 0; color: ${headerColor}; font-size: 24px; font-weight: 700;">
          New Comment Received
        </h2>
      </div>

      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Hello <strong style="color: #111827;">${fullName}</strong>,
      </p>

      <p style="font-size: 15px; color: #4B5563; line-height: 1.6;">
        Your answer has received a new comment. Check it out to continue the conversation.
      </p>

      <div style="
        background: #F9FAFB;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        padding: 20px;
        margin: 24px 0;
      ">
        <div style="font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">
          Original Question
        </div>
        <div style="font-size: 15px; color: #111827; line-height: 1.6;">
          ${question.question}
        </div>
      </div>

      <div style="text-align: center;">
        ${button('Open Dashboard', appConfig.origins + `/home?comment=${question._id.toString()}`)}
      </div>
    `;
  } else {
    headerIcon = '📢';

    mainBody = `
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="
          display: inline-block;
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
          border-radius: 50%;
          font-size: 32px;
          line-height: 64px;
          margin-bottom: 16px;
          box-shadow: 0 8px 16px -4px rgba(99, 102, 241, 0.4);
        ">
          ${headerIcon}
        </div>
        <h2 style="margin: 0; color: ${headerColor}; font-size: 24px; font-weight: 700;">
          ${title}
        </h2>
      </div>

      <p style="font-size: 16px; color: #374151; line-height: 1.6;">
        Hello <strong style="color: #111827;">${fullName}</strong>,
      </p>

      <div style="
        background: #F9FAFB;
        border-left: 4px solid #6366F1;
        padding: 20px;
        border-radius: 6px;
        margin: 24px 0;
      ">
        <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6;">
          ${message}
        </p>
      </div>

      ${timelineHTML}
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title || 'Notification'}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      
      <div style=" margin: 0 auto; padding: 20px;">
        
        <!-- Main Container -->
        <div style="
          background: white;
          border-radius: 12px;
          overflow: hidden;
        ">

          <!-- Content -->
          <div style="
            width: 100%;
            padding: 32px 40px;
            box-sizing: border-box;
          ">
            ${mainBody}
            ${footer}
          </div>

          <!-- Footer Banner -->
          <div style="
            background: #F9FAFB;
            padding: 16px 28px;
            text-align: center;
            border-top: 1px solid #E5E7EB;
          ">
            <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
              © ${new Date().getFullYear()} Annam.Ai. All rights reserved.
            </p>
          </div>
        </div>

        <!-- Bottom Spacer -->
        <div style="height: 20px;"></div>
      </div>

    </body>
    </html>
  `;
};

