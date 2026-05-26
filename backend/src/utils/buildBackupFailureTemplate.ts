export const buildBackupFailureTemplate = (
  db: string,
  error?: any,
  timestamp?: string,
) => {
  const errorMessage =
    typeof error === 'string'
      ? error
      : error?.message || 'Unknown error occurred';

  return `
    <div style="border:1px solid #fecaca; background-color:#fef2f2; border-radius:8px; margin-bottom:16px; overflow:hidden;">
      
      <!-- Header -->
      <div style="background-color:#fee2e2; padding:12px 16px; border-bottom:1px solid #fecaca;">
        <h3 style="margin:0; color:#b91c1c; font-size:16px;">
          ❌ Backup Failed
        </h3>
      </div>

      <!-- Body -->
      <div style="padding:14px 16px; font-size:14px; color:#7f1d1d; line-height:1.6;">
        
        <p style="margin:4px 0;">
          <strong>Database:</strong> ${db}
        </p>

        ${
          timestamp
            ? `<p style="margin:4px 0;">
                <strong>Time:</strong> ${timestamp}
              </p>`
            : ''
        }

        <p style="margin:4px 0;">
          <strong>Status:</strong> FAILED
        </p>

        <!-- Error -->
        <div style="margin-top:10px; padding:10px; background-color:#fff; border:1px dashed #fca5a5; border-radius:4px;">
          <strong>Error Details:</strong>
          <div style="margin-top:4px; font-size:13px; color:#991b1b; word-break:break-word;">
            ${errorMessage}
          </div>
        </div>

        <!-- Hint -->
        <div style="margin-top:10px; padding:10px; background-color:#fff7ed; border:1px solid #fed7aa; border-radius:4px;">
          <strong>Possible Cause:</strong>
          <div style="font-size:13px; margin-top:4px;">
            ${
              errorMessage.includes('timeout')
                ? 'Network instability or MongoDB shard unreachable.'
                : errorMessage.includes('Authentication')
                ? 'Invalid credentials or access issue.'
                : errorMessage.includes('ENOENT')
                ? 'File system path issue during compression.'
                : 'Unexpected error. Check logs for deeper investigation.'
            }
          </div>
        </div>

      </div>
    </div>
  `;
};