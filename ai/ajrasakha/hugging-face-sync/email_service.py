"""Email service for sending HuggingFace sync notifications."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
import yagmail

load_dotenv()

IST = timezone(timedelta(hours=5, minutes=30))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s IST %(levelname)s [email] %(message)s",
)
log = logging.getLogger(__name__)

# Email Configuration
EMAIL_USER = os.getenv("EMAIL_USER", "zohosyncsage@annam.ai")
EMAIL_PASS = os.getenv("EMAIL_PASS")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtppro.zoho.in")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
HF_DATASET_LINK = os.getenv(
    "HF_DATASET_LINK",
    "https://huggingface.co/datasets/vicharanashala/ajrasakha-dataset-v1"
)

def _get_notification_emails() -> list[str]:
    """Parse NOTIFICATION_EMAIL env var into a list of emails.
    
    Returns:
        List of email addresses (empty if not configured)
    """
    notif_email = os.getenv("NOTIFICATION_EMAIL", "")
    if not notif_email:
        return []
    return [email.strip() for email in notif_email.split(",") if email.strip()]


def send_sync_notification(
    existing_rows: int,
    new_rows: int,
    newly_added: int,
    sync_time: datetime | None = None,
    error: str | None = None,
) -> bool:
    """Send email notification about sync completion.

    Args:
        existing_rows: Number of rows in dataset before sync
        new_rows: Number of rows after sync (total)
        newly_added: Difference (new_rows - existing_rows)
        sync_time: Timestamp of sync
        error: Optional error message if sync failed

    Returns:
        True if email sent successfully, False otherwise
    """
    if not EMAIL_USER or not EMAIL_PASS:
        log.warning(
            "Email configuration missing. Set EMAIL_USER, EMAIL_PASS in .env"
        )
        return False

    recipient_emails = _get_notification_emails()
    if not recipient_emails:
        log.warning("No notification emails configured. Set NOTIFICATION_EMAIL in .env")
        return False

    if error:
        return _send_error_email(error, sync_time)

    sync_time = sync_time or datetime.now(IST)
    subject = f"HF Sync Completed - {sync_time.strftime('%Y-%m-%d %H:%M')} IST"
    html_content = _build_success_html(existing_rows, new_rows, newly_added, sync_time)

    try:
        with yagmail.SMTP(EMAIL_USER, EMAIL_PASS, host=SMTP_SERVER, port=SMTP_PORT) as yag:
            yag.send(
                to=recipient_emails,
                subject=subject,
                contents=html_content,
            )
        log.info("Email notification sent successfully to %s", recipient_emails)
        return True
    except Exception as e:
        log.error("Failed to send email notification: %s", str(e))
        return False


def _build_success_html(
    existing_rows: int,
    new_rows: int,
    newly_added: int,
    sync_time: datetime,
) -> str:
    """Build HTML email body for successful sync with inline CSS for email client compatibility."""
    formatted_time = sync_time.strftime('%B %d, %Y at %I:%M %p')
    change_indicator = f"+{newly_added:,}" if newly_added >= 0 else str(newly_added)
    change_color = "#10B981" if newly_added >= 0 else "#EF4444"
    
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HuggingFace Sync Complete</title>
    <!--[if mso]>
    <style type="text/css">
        table {{border-collapse: collapse;}}
        .stat-box {{border: 1px solid #E5E7EB;}}
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    
    <!-- Preview Text -->
    <div style="display: none; max-height: 0; overflow: hidden;">
        HF Sync Complete • {newly_added} rows added
    </div>
    
    <!-- Main Container -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F3F4F6;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                
                <!-- Email Card -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%); padding: 32px 40px;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #FFFFFF; line-height: 1.3;">
                                HuggingFace Sync Complete
                            </h1>
                            <p style="margin: 12px 0 0; font-size: 14px; color: rgba(255,255,255,0.9);">
                                {formatted_time} IST
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Success Badge -->
                    <tr>
                        <td style="padding: 24px 40px 0;">
                            <span style="display: inline-block; background-color: #10B981; color: #FFFFFF; font-size: 12px; font-weight: 600; padding: 6px 16px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                                Success
                            </span>
                        </td>
                    </tr>
                    
                    <!-- Stats Grid -->
                    <tr>
                        <td style="padding: 24px 40px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <!-- Existing Rows -->
                                    <td width="33.33%" style="padding-right: 12px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F9FAFB; border-radius: 12px; border: 1px solid #E5E7EB;">
                                            <tr>
                                                <td style="padding: 20px 16px; text-align: center;">
                                                    <p style="margin: 0; font-size: 32px; font-weight: 700; color: #667EEA; line-height: 1;">
                                                        {existing_rows:,}
                                                    </p>
                                                    <p style="margin: 8px 0 0; font-size: 12px; color: #6B7280; line-height: 1.4;">
                                                        Existing Rows<br>
                                                        <span style="color: #9CA3AF; font-size: 11px;">Before Sync</span>
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    
                                    <!-- New Rows -->
                                    <td width="33.33%" style="padding: 0 6px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F9FAFB; border-radius: 12px; border: 1px solid #E5E7EB;">
                                            <tr>
                                                <td style="padding: 20px 16px; text-align: center;">
                                                    <p style="margin: 0; font-size: 32px; font-weight: 700; color: #667EEA; line-height: 1;">
                                                        {new_rows:,}
                                                    </p>
                                                    <p style="margin: 8px 0 0; font-size: 12px; color: #6B7280; line-height: 1.4;">
                                                        New Rows<br>
                                                        <span style="color: #9CA3AF; font-size: 11px;">After Sync</span>
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    
                                    <!-- Newly Added -->
                                    <td width="33.33%" style="padding-left: 12px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F9FAFB; border-radius: 12px; border: 1px solid #E5E7EB;">
                                            <tr>
                                                <td style="padding: 20px 16px; text-align: center;">
                                                    <p style="margin: 0; font-size: 32px; font-weight: 700; color: {change_color}; line-height: 1;">
                                                        {change_indicator}
                                                    </p>
                                                    <p style="margin: 8px 0 0; font-size: 12px; color: #6B7280; line-height: 1.4;">
                                                        Newly Added
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Message -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6;">
                                The dataset has been successfully synced to HuggingFace.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Dataset Link -->
                    <tr>
                        <td style="padding: 20px 40px 24px;">
                            <p style="margin: 0; font-size: 13px; color: #6B7280;">
                                Dataset:
                            </p>
                            <a href="{HF_DATASET_LINK}" style="display: inline-block; margin-top: 4px; font-size: 14px; color: #667EEA; text-decoration: none; font-weight: 500; word-break: break-all;">
                                {HF_DATASET_LINK}
                            </a>
                        </td>
                    </tr>
                    
                    <!-- Divider -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="border-top: 1px solid #E5E7EB;"></div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px 32px;">
                            <p style="margin: 0; font-size: 12px; color: #9CA3AF; line-height: 1.6; text-align: center;">
                                This is an automated notification from the Ajrasakha Agri Platform.<br>
                                Please do not reply to this email.
                            </p>
                        </td>
                    </tr>
                    
                </table>
                <!-- End Email Card -->
                
            </td>
        </tr>
    </table>
    
</body>
</html>"""


def _send_error_email(error: str, sync_time: datetime | None) -> bool:
    """Send email notification for failed sync."""
    if not EMAIL_USER or not EMAIL_PASS:
        return False

    recipient_emails = _get_notification_emails()
    if not recipient_emails:
        return False

    sync_time = sync_time or datetime.now(IST)
    subject = f"HF Sync Failed - {sync_time.strftime('%Y-%m-%d %H:%M')} IST"
    html_content = _build_error_html(error, sync_time)

    try:
        with yagmail.SMTP(EMAIL_USER, EMAIL_PASS, host=SMTP_SERVER, port=SMTP_PORT) as yag:
            yag.send(
                to=recipient_emails,
                subject=subject,
                contents=html_content,
            )
        log.info("Error email notification sent successfully to %s", recipient_emails)
        return True
    except Exception as e:
        log.error("Failed to send error email: %s", str(e))
        return False


def _build_error_html(error: str, sync_time: datetime) -> str:
    """Build HTML email body for failed sync with professional styling."""
    formatted_time = sync_time.strftime('%B %d, %Y at %I:%M %p')
    # Escape HTML entities in error message
    error_escaped = error.replace('&', '&').replace('<', '<').replace('>', '>').replace('"', '"')
    
    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>HuggingFace Sync Failed</title>
    <style>
        /* Email client reset styles */
        body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
        table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
        img {{ -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }}
        
        /* Mobile responsiveness */
        @media screen and (max-width: 600px) {{
            .email-container {{ width: 100% !important; margin: auto !important; }}
            .fluid-padding {{ padding: 24px 20px !important; }}
            .header-padding {{ padding: 30px 20px 20px 20px !important; }}
        }}
    </style>
</head>
<body width="100%" style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: #F4F5F7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <center style="width: 100%; background-color: #F4F5F7;">
        
        <!-- Hidden Preview Text -->
        <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all; font-family: sans-serif;">
            Action Required: HuggingFace synchronization failed at {formatted_time} IST. View error details inside.
        </div>

        <table align="center" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: auto;" class="email-container">
            <!-- Top Spacing -->
            <tr>
                <td height="40" style="font-size: 40px; line-height: 40px;">&nbsp;</td>
            </tr>

            <!-- Main White Card -->
            <tr>
                <td style="background-color: #ffffff; border-radius: 8px; border-top: 4px solid #D93025; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        
                        <!-- Header Section -->
                        <tr>
                            <td class="header-padding" style="padding: 32px 40px 20px 40px;">
                                <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #202124; letter-spacing: -0.5px;">
                                    <span style="color: #D93025; margin-right: 6px;">Alert:</span>HuggingFace Sync Failed
                                </h1>
                                <p style="margin: 8px 0 0 0; font-size: 14px; color: #5F6368;">
                                    Timestamp: <strong>{formatted_time} IST</strong>
                                </p>
                            </td>
                        </tr>

                        <!-- Divider Line -->
                        <tr>
                            <td style="padding: 0 40px;" class="fluid-padding">
                                <hr style="border: 0; border-top: 1px solid #E8EAED; margin: 0;">
                            </td>
                        </tr>

                        <!-- Body Content Section -->
                        <tr>
                            <td class="fluid-padding" style="padding: 24px 40px 32px 40px;">
                                <p style="margin: 0 0 16px 0; font-size: 15px; color: #3C4043; line-height: 1.6;">
                                    An automated synchronization process with HuggingFace encountered an error. The system reported the following issue:
                                </p>

                                <!-- Error Terminal Box -->
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="background-color: #F8F9FA; border: 1px solid #E8EAED; border-radius: 6px; padding: 16px;">
                                            <p style="margin: 0; font-family: 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace; font-size: 13px; color: #D93025; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">{error_escaped}</p>
                                        </td>
                                    </tr>
                                </table>

                                <p style="margin: 20px 0 0 0; font-size: 15px; color: #3C4043; line-height: 1.6;">
                                    Please review the application logs for a comprehensive stack trace and further details.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>

            <!-- Footer Section -->
            <tr>
                <td class="fluid-padding" style="padding: 24px 40px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #80868B; line-height: 1.6;">
                        This is an automated operational alert from the <strong>Ajrasakha Agri Platform</strong>.<br>
                        Please do not reply directly to this email.
                    </p>
                </td>
            </tr>
            
            <!-- Bottom Spacing -->
            <tr>
                <td height="40" style="font-size: 40px; line-height: 40px;">&nbsp;</td>
            </tr>
        </table>
    </center>
</body>
</html>"""
