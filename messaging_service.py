"""Message templates, rendering, and bulk outreach (WhatsApp + optional Twilio SMS)."""

import json
import os
import re
import uuid
from datetime import datetime

DATA_DIR = "data"
TEMPLATES_FILE = os.path.join(DATA_DIR, "templates.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")

DEFAULT_TEMPLATES = [
    {
        "id": "intro-whatsapp",
        "name": "Introduction — WhatsApp",
        "channel": "whatsapp",
        "body": (
            "Hi {name} 👋\n\n"
            "I'm {your_name} from {company}. We help businesses like yours grow online.\n\n"
            "I noticed you're located at {address}. Would you be open to a quick chat?\n\n"
            "Best regards,\n{your_name}"
        ),
    },
    {
        "id": "followup-whatsapp",
        "name": "Follow Up — WhatsApp",
        "channel": "whatsapp",
        "body": (
            "Hello {name},\n\n"
            "Just following up on my previous message. "
            "Your {rating}⭐ rating shows great customer trust — we'd love to partner with you.\n\n"
            "Reply YES if interested.\n\n— {your_name}, {company}"
        ),
    },
    {
        "id": "intro-sms",
        "name": "Short Intro — SMS",
        "channel": "sms",
        "body": (
            "Hi {name}, this is {your_name} from {company}. "
            "We work with businesses in {city}. Can we call you? Reply YES."
        ),
    },
    {
        "id": "no-website",
        "name": "No Website Offer",
        "channel": "whatsapp",
        "body": (
            "Hi {name}!\n\n"
            "I found {name} on Google Maps ({rating}⭐). "
            "Many businesses in {city} are missing a website — we build affordable sites.\n\n"
            "Interested? Call us or reply here.\n— {company}"
        ),
    },
]

DEFAULT_SETTINGS = {
    "your_name": "Admin",
    "company": "RecruitKR",
    "default_country_code": "91",
    "twilio_account_sid": "",
    "twilio_auth_token": "",
    "twilio_from_number": "",
    "whatsapp_delay_sec": 3,
}


def _ensure_data():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(TEMPLATES_FILE):
        with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_TEMPLATES, f, indent=2, ensure_ascii=False)
    if not os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_SETTINGS, f, indent=2, ensure_ascii=False)


def get_templates() -> list[dict]:
    _ensure_data()
    with open(TEMPLATES_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_templates(templates: list[dict]) -> list[dict]:
    _ensure_data()
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        json.dump(templates, f, indent=2, ensure_ascii=False)
    return templates


def get_settings() -> dict:
    _ensure_data()
    with open(SETTINGS_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_settings(settings: dict) -> dict:
    _ensure_data()
    current = get_settings()
    current.update(settings)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)
    return current


def extract_city_from_address(address: str) -> str:
    if not address:
        return ""
    parts = [p.strip() for p in address.split(",")]
    for p in reversed(parts):
        if re.search(r"\b\d{5,6}\b", p):
            continue
        if len(p) > 2 and not re.match(r"^\d", p):
            return p
    return parts[-1] if parts else ""


def render_message(body: str, lead: dict, settings: dict | None = None) -> str:
    settings = settings or get_settings()
    city = extract_city_from_address(lead.get("address", ""))
    rating = lead.get("reviews_average") or ""
    if rating:
        rating = str(rating)

    mapping = {
        "name": lead.get("name") or "there",
        "phone": lead.get("phone_number") or "",
        "address": lead.get("address") or "",
        "city": city,
        "website": lead.get("website") or "N/A",
        "rating": rating or "N/A",
        "reviews": str(lead.get("reviews_count") or "0"),
        "your_name": settings.get("your_name", "Admin"),
        "company": settings.get("company", "RecruitKR"),
        "status": lead.get("status") or "New",
    }
    out = body
    for key, val in mapping.items():
        out = out.replace("{" + key + "}", str(val))
    return out


def normalize_phone(phone: str, country_code: str = "91") -> str:
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return ""
    if digits.startswith(country_code) and len(digits) > 10:
        return digits
    if len(digits) == 10:
        return country_code + digits
    return digits


def whatsapp_url(phone: str, message: str, country_code: str = "91") -> str:
    import urllib.parse
    num = normalize_phone(phone, country_code)
    if not num:
        return ""
    return f"https://wa.me/{num}?text={urllib.parse.quote(message)}"


def twilio_configured(settings: dict | None = None) -> bool:
    s = settings or get_settings()
    return bool(
        s.get("twilio_account_sid")
        and s.get("twilio_auth_token")
        and s.get("twilio_from_number")
    )


def send_sms_twilio(to_phone: str, message: str, settings: dict | None = None) -> dict:
    settings = settings or get_settings()
    if not twilio_configured(settings):
        return {"ok": False, "error": "Twilio not configured. Add credentials in Settings."}

    try:
        from twilio.rest import Client
    except ImportError:
        return {"ok": False, "error": "Install twilio: pip install twilio"}

    cc = settings.get("default_country_code", "91")
    to = "+" + normalize_phone(to_phone, cc)
    client = Client(settings["twilio_account_sid"], settings["twilio_auth_token"])
    try:
        msg = client.messages.create(
            body=message,
            from_=settings["twilio_from_number"],
            to=to,
        )
        return {"ok": True, "sid": msg.sid}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def build_campaign(
    leads: list[dict],
    template_id: str,
    channel: str = "whatsapp",
    mark_contacted: bool = True,
) -> dict:
    templates = get_templates()
    template = next((t for t in templates if t["id"] == template_id), None)
    if not template:
        return {"status": "error", "message": "Template not found"}

    settings = get_settings()
    use_channel = channel or template.get("channel", "whatsapp")
    messages = []
    skipped = 0

    for i, lead in enumerate(leads):
        phone = lead.get("phone_number", "")
        if not phone:
            skipped += 1
            continue

        body = render_message(template["body"], lead, settings)
        entry = {
            "index": i,
            "_idx": lead.get("_idx"),
            "name": lead.get("name", ""),
            "phone": phone,
            "message": body,
            "channel": use_channel,
            "sent": False,
            "error": None,
        }

        if use_channel == "whatsapp":
            entry["url"] = whatsapp_url(
                phone, body, settings.get("default_country_code", "91"))
        elif use_channel == "sms":
            if twilio_configured(settings):
                result = send_sms_twilio(phone, body, settings)
                entry["sent"] = result.get("ok", False)
                entry["error"] = result.get("error")
                if mark_contacted and entry["sent"]:
                    lead["status"] = "Contacted"
            else:
                entry["url"] = f"sms:{normalize_phone(phone, settings.get('default_country_code', '91'))}"
                entry["error"] = "Twilio not configured — use copy or configure SMS in Settings"
        elif use_channel == "copy":
            entry["url"] = None

        messages.append(entry)

    return {
        "status": "success",
        "campaign_id": str(uuid.uuid4())[:8],
        "created_at": datetime.now().isoformat(),
        "template": template["name"],
        "channel": use_channel,
        "total": len(leads),
        "ready": len(messages),
        "skipped": skipped,
        "twilio_active": twilio_configured(settings) if use_channel == "sms" else False,
        "messages": messages,
        "mark_contacted": mark_contacted,
    }
