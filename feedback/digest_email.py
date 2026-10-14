"""
Weekly digest email sender.
Pulls worst-performing GDB entries and emails the agri team.
Runs automatically every Monday at 9am IST via APScheduler.
Can also be triggered manually via POST /digest/send endpoint.
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
DIGEST_RECIPIENT_EMAIL = os.getenv("DIGEST_RECIPIENT_EMAIL")


def build_email_html(entries: list, total_analysed: int, below_threshold: int, generated_at: datetime) -> str:
    """Build the HTML body for the weekly digest email."""

    rows = ""
    for entry in entries:
        rate = entry["helpfulness_rate"]
        if rate < 40:
            color = "#ef4444"
        elif rate < 60:
            color = "#f97316"
        else:
            color = "#22c55e"

        bar_width = int(rate)
        rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 8px; font-weight: bold; color: #6b7280;">#{entry['rank']}</td>
            <td style="padding: 12px 8px; font-family: monospace; font-size: 12px; color: #6b7280;">
                {entry['answer_id'][:20]}...
            </td>
            <td style="padding: 12px 8px;">
                <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                    {entry['domain']}
                </span>
            </td>
            <td style="padding: 12px 8px;">
                <span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                    {entry['state']}
                </span>
            </td>
            <td style="padding: 12px 8px; text-align: center;">{entry['total_responses']}</td>
            <td style="padding: 12px 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="flex: 1; background: #e5e7eb; border-radius: 4px; height: 8px;">
                        <div style="width: {bar_width}%; background: {color}; border-radius: 4px; height: 8px;"></div>
                    </div>
                    <span style="font-weight: bold; color: {color}; min-width: 40px;">{rate}%</span>
                </div>
            </td>
        </tr>
        """

    below_color = "#ef4444" if below_threshold > 0 else "#22c55e"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb;">
        <div style="max-width: 700px; margin: 0 auto; padding: 24px;">

            <!-- Header -->
            <div style="background: #166534; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <h1 style="color: white; margin: 0; font-size: 22px;">🌾 Weekly GDB Digest</h1>
                <p style="color: #bbf7d0; margin: 8px 0 0 0; font-size: 14px;">
                    Farmer Feedback System — Worst-performing entries this week
                </p>
            </div>

            <!-- Summary cards -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0;">Generated</p>
                    <p style="font-weight: bold; font-size: 13px; margin: 0; color: #111827;">
                        {generated_at.strftime("%d %b %Y, %I:%M %p")}
                    </p>
                </div>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="color: #1d4ed8; font-size: 12px; margin: 0 0 4px 0;">Entries Analysed</p>
                    <p style="font-weight: bold; font-size: 24px; margin: 0; color: #1e40af;">{total_analysed}</p>
                </div>
                <div style="background: {'#fef2f2' if below_threshold > 0 else '#f0fdf4'}; border: 1px solid {'#fecaca' if below_threshold > 0 else '#bbf7d0'}; border-radius: 8px; padding: 16px; text-align: center;">
                    <p style="color: {below_color}; font-size: 12px; margin: 0 0 4px 0;">Below 60% Threshold</p>
                    <p style="font-weight: bold; font-size: 24px; margin: 0; color: {below_color};">{below_threshold}</p>
                </div>
            </div>

            <!-- Table -->
            <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                    <h2 style="margin: 0; font-size: 16px; color: #111827;">
                        Worst-performing GDB entries (ranked)
                    </h2>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                            <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #6b7280;">Rank</th>
                            <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #6b7280;">Answer ID</th>
                            <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #6b7280;">Domain</th>
                            <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #6b7280;">State</th>
                            <th style="padding: 10px 8px; text-align: center; font-size: 12px; color: #6b7280;">Responses</th>
                            <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #6b7280;">Helpfulness Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows if rows else '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #6b7280;">No entries below threshold this week ✅</td></tr>'}
                    </tbody>
                </table>
            </div>

            <!-- Footer -->
            <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                <p>This digest is sent automatically every Monday at 9:00 AM IST.</p>
                <p>View the full dashboard at <a href="http://localhost:5173" style="color: #166534;">Feedback Dashboard</a></p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


def send_digest_email(entries: list, total_analysed: int, below_threshold: int) -> dict:
    """Send the weekly digest email via SMTP."""

    if not SMTP_USER or not SMTP_PASSWORD or not DIGEST_RECIPIENT_EMAIL:
        raise ValueError(
            "SMTP credentials not configured. "
            "Set SMTP_USER, SMTP_PASSWORD, and DIGEST_RECIPIENT_EMAIL in .env"
        )

    generated_at = datetime.now()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🌾 Weekly GDB Digest — {generated_at.strftime('%d %b %Y')} | {below_threshold} entries below threshold"
    msg["From"] = SMTP_USER
    msg["To"] = DIGEST_RECIPIENT_EMAIL

    html_body = build_email_html(entries, total_analysed, below_threshold, generated_at)
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, DIGEST_RECIPIENT_EMAIL, msg.as_string())

    logger.info(f"Digest email sent to {DIGEST_RECIPIENT_EMAIL}")

    return {
        "sent_to": DIGEST_RECIPIENT_EMAIL,
        "entries_count": len(entries),
        "below_threshold": below_threshold,
        "generated_at": generated_at.isoformat()
    }
