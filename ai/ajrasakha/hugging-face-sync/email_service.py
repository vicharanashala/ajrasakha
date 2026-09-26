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
    """Build HTML email body for successful sync - pure inline CSS."""
    formatted_time = sync_time.strftime('%B %d, %Y at %I:%M %p')
    change_indicator = f"+{newly_added:,}" if newly_added >= 0 else str(newly_added)
    change_color = "#10B981" if newly_added >= 0 else "#EF4444"
    
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif;">
<div style="max-width:500px;margin:0 auto;">
<div style="background:linear-gradient(135deg,#667EEA,#764BA2);padding:12px 16px;color:#fff;">
<span style="font-size:13px;font-weight:600;">HuggingFace Sync Complete</span>
<span style="background:#10B981;color:#fff;font-size:10px;padding:2px 6px;border-radius:8px;margin-left:6px;">✓ SUCCESS</span>
<p style="margin:4px 0 0;font-size:10px;opacity:0.9;">{formatted_time} IST</p>
</div>
<div style="padding:10px 16px;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="33%" style="padding-right:6px;"><table width="100%" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:4px;"><tr><td style="padding:8px 4px;text-align:center;">
<div style="font-size:18px;font-weight:bold;color:#667EEA;">{existing_rows:,}</div>
<div style="font-size:10px;color:#666;">Existing Rows</div>
</td></tr></table></td>
<td width="33%" style="padding:0 3px;"><table width="100%" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:4px;"><tr><td style="padding:8px 4px;text-align:center;">
<div style="font-size:18px;font-weight:bold;color:#667EEA;">{new_rows:,}</div>
<div style="font-size:10px;color:#666;">New Rows</div>
</td></tr></table></td>
<td width="33%" style="padding-left:6px;"><table width="100%" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:4px;"><tr><td style="padding:8px 4px;text-align:center;">
<div style="font-size:18px;font-weight:bold;color:{change_color};">{change_indicator}</div>
<div style="font-size:10px;color:#666;">Newly Added</div>
</td></tr></table></td>
</tr></table>
</div>
<div style="padding:0 16px 10px;">
<p style="margin:0;font-size:11px;color:#333;">Synced to HuggingFace.<br><a href="{HF_DATASET_LINK}" style="color:#667EEA;">{HF_DATASET_LINK}</a></p>
</div>
<div style="border-top:1px solid #E5E7EB;padding:8px 16px;text-align:center;">
<p style="margin:0;font-size:9px;color:#999;">Ajrasakha Agri Platform</p>
</div>
</div>
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
    """Build HTML email body for failed sync - pure inline CSS."""
    formatted_time = sync_time.strftime('%B %d, %Y at %I:%M %p')
    error_escaped = error.replace('&', '&').replace('<', '<').replace('>', '>').replace('"', '"')
    
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,sans-serif;">
<div style="max-width:500px;margin:0 auto;">
<div style="background:#D93025;padding:12px 16px;color:#fff;">
<span style="font-size:13px;font-weight:600;">⚠ HuggingFace Sync Failed</span>
<p style="margin:4px 0 0;font-size:10px;opacity:0.9;">{formatted_time} IST</p>
</div>
<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:4px;padding:12px;margin:12px 16px;font-family:monospace;font-size:11px;color:#D93025;white-space:pre-wrap;">{error_escaped}</div>
<div style="border-top:1px solid #E8EAED;padding:8px 16px;text-align:center;">
<p style="margin:0;font-size:9px;color:#999;">Ajrasakha Agri Platform</p>
</div>
</div>
</body>
</html>"""
