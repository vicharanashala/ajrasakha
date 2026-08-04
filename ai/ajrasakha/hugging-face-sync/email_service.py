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
    """Build HTML email body for successful sync."""
    status_color = "#10B981"  # Green
    status_text = "Success"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .header p {{ margin: 5px 0 0; opacity: 0.9; }}
            .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
            .status {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; background: {status_color}; color: white; }}
            .stats {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }}
            .stat-box {{ background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
            .stat-value {{ font-size: 28px; font-weight: bold; color: #667eea; }}
            .stat-label {{ font-size: 12px; color: #6b7280; margin-top: 5px; }}
            .footer {{ margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }}
            .link {{ color: #667eea; text-decoration: none; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>HuggingFace Sync Complete</h1>
            <p>{sync_time.strftime('%B %d, %Y at %I:%M %p')} IST</p>
        </div>
        <div class="content">
            <p><span class="status">{status_text}</span></p>
            <div class="stats">
                <div class="stat-box">
                    <div class="stat-value">{existing_rows:,}</div>
                    <div class="stat-label">Existing Rows<br>(Before Sync)</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{new_rows:,}</div>
                    <div class="stat-label">New Rows<br>(After Sync)</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">{'+' if newly_added >= 0 else ''}{newly_added:,}</div>
                    <div class="stat-label">Newly Added</div>
                </div>
            </div>
            <p>The dataset has been successfully synced to HuggingFace.</p>
            <p>Dataset: <a href="{HF_DATASET_LINK}" class="link">{HF_DATASET_LINK}</a></p>
            <div class="footer">
                <p>This is an automated notification from the Ajrasakha Agri Platform.</p>
                <p>Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


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
    """Build HTML email body for failed sync."""
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
            .header h1 {{ margin: 0; font-size: 24px; }}
            .header p {{ margin: 5px 0 0; opacity: 0.9; }}
            .content {{ background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }}
            .status {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; background: #ef4444; color: white; }}
            .error-box {{ background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444; margin: 20px 0; }}
            .error-message {{ font-family: monospace; font-size: 13px; color: #dc2626; margin: 0; white-space: pre-wrap; }}
            .footer {{ margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>HuggingFace Sync Failed</h1>
            <p>{sync_time.strftime('%B %d, %Y at %I:%M %p')} IST</p>
        </div>
        <div class="content">
            <p><span class="status">Failed</span></p>
            <div class="error-box">
                <p class="error-message">{error}</p>
            </div>
            <p>Please check the logs for more details.</p>
            <div class="footer">
                <p>This is an automated notification from the Ajrasakha Agri Platform.</p>
                <p>Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    """
    return html