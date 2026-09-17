"""Email service for sending backup and sync notifications."""

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


def _get_notification_emails() -> list[str]:
    """Parse NOTIFICATION_EMAIL env var into a list of emails."""
    notif_email = os.getenv("NOTIFICATION_EMAIL", "")
    if not notif_email:
        return []
    return [email.strip() for email in notif_email.split(",") if email.strip()]


def send_backup_notification(
    backup_size_mb: float,
    gcs_path: str,
    backup_time: datetime | None = None,
    error: str | None = None,
) -> bool:
    """Send email notification about backup result.

    Args:
        backup_size_mb: Size of backup in MB
        gcs_path: GCS path where backup was stored
        backup_time: Timestamp of backup
        error: Optional error message if backup failed

    Returns:
        True if email sent successfully, False otherwise
    """
    if not EMAIL_USER or not EMAIL_PASS:
        log.warning("Email configuration missing. Set EMAIL_USER, EMAIL_PASS in .env")
        return False

    recipient_emails = _get_notification_emails()
    if not recipient_emails:
        log.warning("No notification emails configured. Set NOTIFICATION_EMAIL in .env")
        return False

    backup_time = backup_time or datetime.now(IST)
    
    if error:
        return _send_backup_error_email(error, backup_time)

    subject = f"DB Backup Completed - {backup_time.strftime('%Y-%m-%d %H:%M')} IST"
    html_content = _build_backup_success_html(backup_size_mb, gcs_path, backup_time)

    try:
        with yagmail.SMTP(EMAIL_USER, EMAIL_PASS, host=SMTP_SERVER, port=SMTP_PORT) as yag:
            yag.send(
                to=recipient_emails,
                subject=subject,
                contents=html_content,
            )
        log.info("Backup email sent successfully to %s", recipient_emails)
        return True
    except Exception as e:
        log.error("Failed to send backup email: %s", str(e))
        return False


def _build_backup_success_html(
    backup_size_mb: float,
    gcs_path: str,
    backup_time: datetime,
) -> str:
    """Build HTML email body for successful backup."""
    formatted_time = backup_time.strftime('%B %d, %Y at %I:%M %p')
    
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif;">
<div style="max-width:500px;margin:0 auto;">
<div style="background:linear-gradient(135deg,#059669,#10B981);padding:12px 16px;color:#fff;">
<span style="font-size:13px;font-weight:600;">PostgreSQL Backup Complete</span>
<span style="background:#fff;color:#059669;font-size:10px;padding:2px 6px;border-radius:8px;margin-left:6px;">✓ SUCCESS</span>
<p style="margin:4px 0 0;font-size:10px;opacity:0.9;">{formatted_time} IST</p>
</div>
<div style="background:#fff;padding:16px;margin:12px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<h3 style="margin:0 0 12px;font-size:14px;color:#333;">Backup Details</h3>
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="padding:8px 0;border-bottom:1px solid #E5E7EB;">
<span style="font-size:11px;color:#666;">Database</span>
<div style="font-size:13px;font-weight:600;color:#333;">ai3</div>
</td>
</tr>
<tr>
<td style="padding:8px 0;border-bottom:1px solid #E5E7EB;">
<span style="font-size:11px;color:#666;">Backup Size</span>
<div style="font-size:13px;font-weight:600;color:#059669;">{backup_size_mb:.2f} MB</div>
</td>
</tr>
<tr>
<td style="padding:8px 0;">
<span style="font-size:11px;color:#666;">Location</span>
<div style="font-size:11px;color:#059669;word-break:break-all;">{gcs_path}</div>
</td>
</tr>
</table>
</div>
<div style="border-top:1px solid #E5E7EB;padding:8px 16px;text-align:center;">
<p style="margin:0;font-size:9px;color:#999;">Ajrasakha Agri Platform</p>
</div>
</div>
</body>
</html>"""


def _send_backup_error_email(error: str, backup_time: datetime) -> bool:
    """Send email notification for failed backup."""
    if not EMAIL_USER or not EMAIL_PASS:
        return False

    recipient_emails = _get_notification_emails()
    if not recipient_emails:
        return False

    formatted_time = backup_time.strftime('%B %d, %Y at %I:%M %p')
    subject = f"DB Backup Failed - {backup_time.strftime('%Y-%m-%d %H:%M')} IST"
    html_content = _build_backup_error_html(error, formatted_time)

    try:
        with yagmail.SMTP(EMAIL_USER, EMAIL_PASS, host=SMTP_SERVER, port=SMTP_PORT) as yag:
            yag.send(
                to=recipient_emails,
                subject=subject,
                contents=html_content,
            )
        log.info("Backup error email sent successfully to %s", recipient_emails)
        return True
    except Exception as e:
        log.error("Failed to send backup error email: %s", str(e))
        return False


def _build_backup_error_html(error: str, formatted_time: str) -> str:
    """Build HTML email body for failed backup."""
    error_escaped = error.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
    
    return f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,sans-serif;">
<div style="max-width:500px;margin:0 auto;">
<div style="background:#DC2626;padding:12px 16px;color:#fff;">
<span style="font-size:13px;font-weight:600;">⚠ PostgreSQL Backup Failed</span>
<p style="margin:4px 0 0;font-size:10px;opacity:0.9;">{formatted_time} IST</p>
</div>
<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:4px;padding:12px;margin:12px 16px;font-family:monospace;font-size:11px;color:#DC2626;white-space:pre-wrap;">{error_escaped}</div>
<div style="border-top:1px solid #E8EAED;padding:8px 16px;text-align:center;">
<p style="margin:0;font-size:9px;color:#999;">Ajrasakha Agri Platform</p>
</div>
</div>
</body>
</html>"""


# Keep the original HF sync functions for backwards compatibility
def send_sync_notification(
    existing_rows: int,
    new_rows: int,
    newly_added: int,
    sync_time: datetime | None = None,
    error: str | None = None,
) -> bool:
    """Send email notification about HF sync completion."""
    HF_DATASET_LINK = os.getenv(
        "HF_DATASET_LINK",
        "https://huggingface.co/datasets/vicharanashala/ajrasakha-dataset-v1"
    )
    
    if not EMAIL_USER or not EMAIL_PASS:
        log.warning("Email configuration missing. Set EMAIL_USER, EMAIL_PASS in .env")
        return False

    recipient_emails = _get_notification_emails()
    if not recipient_emails:
        log.warning("No notification emails configured. Set NOTIFICATION_EMAIL in .env")
        return False

    if error:
        sync_time = sync_time or datetime.now(IST)
        subject = f"HF Sync Failed - {sync_time.strftime('%Y-%m-%d %H:%M')} IST"
        html_content = _build_hf_error_html(error, sync_time)
    else:
        sync_time = sync_time or datetime.now(IST)
        subject = f"HF Sync Completed - {sync_time.strftime('%Y-%m-%d %H:%M')} IST"
        html_content = _build_hf_success_html(existing_rows, new_rows, newly_added, sync_time, HF_DATASET_LINK)

    try:
        with yagmail.SMTP(EMAIL_USER, EMAIL_PASS, host=SMTP_SERVER, port=SMTP_PORT) as yag:
            yag.send(to=recipient_emails, subject=subject, contents=html_content)
        log.info("Email notification sent successfully to %s", recipient_emails)
        return True
    except Exception as e:
        log.error("Failed to send email notification: %s", str(e))
        return False


def _build_hf_success_html(
    existing_rows: int, new_rows: int, newly_added: int,
    sync_time: datetime, HF_DATASET_LINK: str
) -> str:
    """Build HTML email body for successful HF sync."""
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


def _build_hf_error_html(error: str, sync_time: datetime) -> str:
    """Build HTML email body for failed HF sync."""
    formatted_time = sync_time.strftime('%B %d, %Y at %I:%M %p')
    error_escaped = error.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
    
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