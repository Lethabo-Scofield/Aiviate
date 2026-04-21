import os
import smtplib
import traceback
from pathlib import Path
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

# explicitly load .env from project root
load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

SMTP_HOST     = os.getenv("SMTP_HOST")
SMTP_PORT     = int(os.getenv("SMTP_PORT", 587))
SMTP_USER     = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
EMAIL_FROM    = os.getenv("EMAIL_FROM")
AVIATE_APP_LINK = os.getenv("AVIATE_APP_LINK", "https://expo.dev/artifacts/eas/4uEQdzphj6Xfc4eqpKmFxK.apk")

print(f"[EMAIL SERVICE] HOST={SMTP_HOST} PORT={SMTP_PORT} USER={SMTP_USER} FROM={EMAIL_FROM}")


def send_email(to, subject, html, attachments=None):
    print(f"[EMAIL] Preparing to send → to={to} subject={subject}")

    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD or not EMAIL_FROM:
        print("[EMAIL ERROR] SMTP settings missing in .env — email not sent")
        return

    msg = MIMEMultipart()
    msg["From"]    = EMAIL_FROM
    msg["To"]      = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    if attachments:
        for file_path in attachments:
            if os.path.exists(file_path):
                with open(file_path, "rb") as f:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(f.read())
                    encoders.encode_base64(part)
                    part.add_header(
                        "Content-Disposition",
                        f'attachment; filename="{os.path.basename(file_path)}"',
                    )
                    msg.attach(part)
                print(f"[EMAIL] Attached: {file_path}")
            else:
                print(f"[EMAIL WARNING] Attachment not found: {file_path}")

    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(EMAIL_FROM, to, msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(EMAIL_FROM, to, msg.as_string())

        print(f"[EMAIL SUCCESS] ✅ Sent to {to}")
    except Exception as e:
        print(f"[EMAIL ERROR] ❌ Failed to send to {to}: {e}")
        traceback.print_exc()
