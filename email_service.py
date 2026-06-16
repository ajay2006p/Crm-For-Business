"""Gmail email sending via SMTP (app-password based, no OAuth required)."""

import mimetypes
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid
from pathlib import Path

GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 465  # SSL

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(addr: str) -> bool:
    return bool(addr and _EMAIL_RE.match(addr.strip()))


def gmail_configured(settings: dict | None) -> bool:
    s = settings or {}
    return bool(s.get("gmail_address") and s.get("gmail_app_password"))


def _local_image_path(image_url: str) -> Path | None:
    """If image_url points to a locally uploaded file (/uploads/...), return its
    filesystem path so it can be embedded inline; otherwise None."""
    if not image_url:
        return None
    marker = "/uploads/"
    idx = image_url.find(marker)
    if idx == -1:
        return None
    rel = image_url[idx + 1:]  # drop leading slash -> "uploads/outreach/x.jpg"
    p = Path(rel)
    return p if p.exists() else None


_IMG_SRC_RE = re.compile(r'src=["\']([^"\']*?/uploads/[^"\']+)["\']', re.IGNORECASE)


def _inline_local_images(html: str) -> tuple[str, list[tuple[str, "Path"]]]:
    """Replace every <img src="...uploads/..."> with a cid: reference so the image
    is embedded inline. Returns (rewritten_html, [(cid, filesystem_path), ...])."""
    attachments: list[tuple[str, Path]] = []

    def repl(m: "re.Match") -> str:
        path = _local_image_path(m.group(1))
        if not path:
            return m.group(0)
        cid = make_msgid()
        attachments.append((cid, path))
        return f'src="cid:{cid[1:-1]}"'

    return _IMG_SRC_RE.sub(repl, html), attachments


def _build_message(
    from_addr: str,
    from_name: str,
    to_addr: str,
    subject: str,
    body: str,
    image_url: str = "",
    html_body: str = "",
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = f"{from_name} <{from_addr}>" if from_name else from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject or "(no subject)"

    msg.set_content(body)  # plain-text fallback

    if html_body:
        # Pre-built HTML (e.g. from the block editor) — embed any local images inline.
        html, attachments = _inline_local_images(html_body)
        msg.add_alternative(html, subtype="html")
        html_part = msg.get_payload()[1]
        for cid, path in attachments:
            ctype, _ = mimetypes.guess_type(str(path))
            maintype, subtype = (ctype or "image/jpeg").split("/", 1)
            html_part.add_related(path.read_bytes(), maintype=maintype, subtype=subtype, cid=cid)
        return msg

    local_img = _local_image_path(image_url)
    is_remote = bool(image_url) and image_url.lower().startswith(("http://", "https://")) and not local_img

    html_lines = "".join(f"<p>{_escape(line)}</p>" if line.strip() else "<br>"
                         for line in body.split("\n"))
    html = f'<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">{html_lines}'
    cid = None
    if local_img:
        cid = make_msgid()
        html += f'<p><img src="cid:{cid[1:-1]}" alt="" style="max-width:480px;border-radius:8px;"/></p>'
    elif is_remote:
        html += f'<p><img src="{_escape(image_url)}" alt="" style="max-width:480px;border-radius:8px;"/></p>'
    html += "</div>"
    msg.add_alternative(html, subtype="html")

    if local_img and cid:
        ctype, _ = mimetypes.guess_type(str(local_img))
        maintype, subtype = (ctype or "image/jpeg").split("/", 1)
        msg.get_payload()[1].add_related(
            local_img.read_bytes(), maintype=maintype, subtype=subtype, cid=cid)
    return msg


def _escape(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def send_email_gmail(
    to_addr: str,
    subject: str,
    body: str,
    settings: dict,
    image_url: str = "",
    html_body: str = "",
) -> dict:
    """Send a single email through Gmail SMTP. Returns {"ok": bool, ...}."""
    if not gmail_configured(settings):
        return {"ok": False, "error": "Gmail not configured. Add Gmail address + App Password in Settings."}
    if not is_valid_email(to_addr):
        return {"ok": False, "error": "No valid email address for this recipient."}

    from_addr = settings["gmail_address"].strip()
    app_password = settings["gmail_app_password"].replace(" ", "")  # Google shows it with spaces
    from_name = settings.get("gmail_sender_name") or settings.get("company") or ""

    msg = _build_message(from_addr, from_name, to_addr.strip(), subject, body, image_url, html_body)
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(GMAIL_SMTP_HOST, GMAIL_SMTP_PORT, context=context, timeout=30) as server:
            server.login(from_addr, app_password)
            server.send_message(msg)
        return {"ok": True}
    except smtplib.SMTPAuthenticationError:
        return {"ok": False, "error": "Gmail login failed. Use a 16-char App Password (not your normal password) and enable 2-Step Verification."}
    except Exception as e:
        return {"ok": False, "error": str(e)}
