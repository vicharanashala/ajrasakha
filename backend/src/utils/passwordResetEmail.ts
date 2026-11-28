export interface PasswordResetEmail {
  subject: string;
  text: string;
  html: string;
}

// Builds the subject, plain text and HTML body of the password reset OTP email.
export function buildPasswordResetEmail(
  otp: string,
  validForMinutes: number,
): PasswordResetEmail {
  const subject = 'Your Annam.ai password reset code';
  const text = `Use this code to reset your password: ${otp}

The code is valid for ${validForMinutes} minutes and can be used only once.
If you did not request a password reset, you can safely ignore this email.`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f3f6f4;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f6f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#15803d;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold;">Annam.ai</td>
            </tr>
            <tr>
              <td style="padding:28px;color:#1f2937;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 12px;font-size:18px;font-weight:bold;">Reset your password</p>
                <p style="margin:0 0 20px;">We received a request to reset the password for your account. Enter the code below to continue.</p>
                <p style="margin:0 0 20px;text-align:center;">
                  <span style="display:inline-block;padding:12px 24px;background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:30px;font-weight:bold;letter-spacing:8px;color:#166534;">${otp}</span>
                </p>
                <p style="margin:0 0 12px;">This code is valid for <strong>${validForMinutes} minutes</strong> and can be used only once.</p>
                <p style="margin:0;color:#6b7280;font-size:13px;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {subject, text, html};
}
