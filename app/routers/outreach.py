from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import CampaignCreate, TemplateCreate
from app.services.activity_service import log_activity
from app.utils.files import save_upload
from app.utils.helpers import parse_object_id, serialize_doc, serialize_many, utcnow
from email_service import gmail_configured, is_valid_email, send_email_gmail
from messaging_service import get_settings, render_message
from template_render import render_blocks

router = APIRouter(prefix="/api/outreach", tags=["outreach"])

_IMAGE_EXT = {".png", ".jpg", ".jpeg"}


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...), user=Depends(get_current_user)):
    from pathlib import Path
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Only PNG or JPG images are allowed")
    saved = await save_upload(file, "outreach")
    # Relative, host-independent URL served by the /uploads static mount.
    url = "/" + saved["path"] if not saved["path"].startswith("/") else saved["path"]
    return {"status": "success", "url": url, "name": saved["original_name"]}


@router.get("/templates")
async def list_templates(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.templates.find({}).sort("created_at", -1).to_list(200)
    if not docs:
        from messaging_service import get_templates as legacy_templates
        for t in legacy_templates():
            t["created_at"] = utcnow()
            await db.templates.update_one({"id": t["id"]}, {"$set": t}, upsert=True)
        docs = await db.templates.find({}).to_list(200)
    return {"status": "success", "templates": serialize_many(docs)}


@router.post("/templates")
async def save_template(body: TemplateCreate, user=Depends(get_current_user)):
    db = get_db()
    doc = body.model_dump()
    doc["id"] = f"tpl-{int(utcnow().timestamp())}"
    doc["created_at"] = utcnow()
    doc["updated_at"] = utcnow()
    await db.templates.insert_one(doc)
    await log_activity(f"Template created: {doc['name']}", "outreach", user)
    return {"status": "success", "template": serialize_doc(doc)}


def _template_filter(template_id: str) -> dict:
    """Match a template by business `id` or Mongo `_id` (frontend may send either)."""
    ors: list[dict] = [{"id": template_id}]
    try:
        ors.append({"_id": parse_object_id(template_id)})
    except ValueError:
        pass
    return {"$or": ors}


@router.put("/templates/{template_id}")
async def update_template(template_id: str, body: TemplateCreate, user=Depends(get_current_user)):
    db = get_db()
    updates = body.model_dump()
    updates["updated_at"] = utcnow()
    res = await db.templates.update_one(_template_filter(template_id), {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "success"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user=Depends(get_current_user)):
    db = get_db()
    await db.templates.delete_one(_template_filter(template_id))
    return {"status": "success"}


@router.get("/campaigns")
async def campaigns(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.campaigns.find({}).sort("created_at", -1).limit(50).to_list(50)
    return {"status": "success", "campaigns": serialize_many(docs)}


async def _find_template(db, template_id: str):
    """Look up a template by its business `id` field, falling back to the Mongo
    `_id` (the API serializes `_id` into `id`, so the frontend may send either)."""
    tpl = await db.templates.find_one({"id": template_id})
    if not tpl:
        try:
            tpl = await db.templates.find_one({"_id": parse_object_id(template_id)})
        except ValueError:
            tpl = None
    return tpl


@router.post("/campaigns")
async def create_campaign(body: CampaignCreate, request: Request, user=Depends(get_current_user)):
    db = get_db()
    tpl = await _find_template(db, body.template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    leads = []
    for lid in body.lead_ids:
        try:
            lead = await db.leads.find_one({"_id": parse_object_id(lid)})
        except ValueError:
            lead = None
        if lead:
            lead["id"] = str(lead["_id"])
            leads.append(lead)
    resolved_lead_count = len(leads)
    # Manually-typed recipients (not stored as leads) — treated as ad-hoc pseudo-leads.
    for mr in body.manual_recipients:
        if not (mr.email or mr.phone):
            continue
        leads.append({
            "name": mr.name or "there",
            "email": mr.email,
            "phone_number": mr.phone,
            "id": None,
            "_manual": True,
        })
    if not leads:
        raise HTTPException(status_code=400, detail="No recipients selected")
    from messaging_service import whatsapp_url
    settings_data = get_settings()
    # Gmail credentials live in the DB settings doc (saved via Settings UI).
    db_settings = await db.settings.find_one({}) or {}
    email_settings = {**settings_data, **{k: v for k, v in db_settings.items() if v is not None}}

    is_email = body.channel == "email"
    blocks = tpl.get("blocks") or []
    use_blocks = is_email and bool(blocks)
    image_url = tpl.get("image_url") or ""
    # For click-to-chat links a relative /uploads path isn't reachable — make it absolute.
    link_image = image_url
    if image_url.startswith("/"):
        link_image = str(request.base_url).rstrip("/") + image_url
    sent_count = 0
    messages = []
    sent_lead_ids = []
    for lead in leads:
        if use_blocks:
            rendered = render_blocks(blocks, lead, settings_data)
            msg = rendered["text"]
            html_body = rendered["html"]
        else:
            msg = render_message(tpl["body"], lead, settings_data)
            html_body = ""
        if image_url and not is_email:
            msg = f"{msg}\n\n📷 {link_image}"
        entry = {
            "name": lead.get("name"),
            "phone": lead.get("phone_number"),
            "email": lead.get("email"),
            "message": msg,
            "_idx": lead.get("id"),
            "manual": bool(lead.get("_manual")),
            "channel": body.channel,
            "sent": False,
            "error": None,
        }
        if body.channel == "whatsapp" and lead.get("phone_number"):
            entry["url"] = whatsapp_url(
                lead["phone_number"], msg, settings_data.get("default_country_code", "91"))
        elif is_email:
            subject = render_message(tpl.get("subject") or f"A note from {{company}}", lead, settings_data)
            entry["subject"] = subject
            to_addr = lead.get("email") or ""
            if not is_valid_email(to_addr):
                entry["error"] = "No valid email address"
            else:
                result = send_email_gmail(to_addr, subject, msg, email_settings, image_url, html_body)
                entry["sent"] = result.get("ok", False)
                entry["error"] = result.get("error")
                if entry["sent"]:
                    sent_count += 1
                    if lead.get("_id"):
                        sent_lead_ids.append(lead["_id"])
        messages.append(entry)
    campaign = {
        "status": "success",
        "template": tpl["name"],
        "channel": body.channel,
        "messages": messages,
        "ready": len(messages),
        "sent": sent_count,
        "skipped": len(body.lead_ids) - resolved_lead_count,
        "gmail_active": gmail_configured(email_settings) if is_email else False,
    }
    doc = {**campaign, "created_at": utcnow(), "created_by": user.get("id"), "lead_count": len(leads)}
    await db.campaigns.insert_one(doc)
    if body.mark_contacted:
        # For email, only mark leads that were actually delivered; other channels
        # generate click-to-send links so we mark everything that was prepared.
        # Manual recipients have no _id and are skipped here.
        to_mark = sent_lead_ids if is_email else [l["_id"] for l in leads if l.get("_id")]
        action = "Email sent" if is_email else "Campaign sent"
        for lead_id in to_mark:
            await db.leads.update_one(
                {"_id": lead_id},
                {"$set": {"status": "Contacted", "updated_at": utcnow()},
                 "$push": {"activity_history": {"action": action, "at": utcnow().isoformat()}}},
            )
    await log_activity(f"Campaign: {tpl['name']} → {len(leads)} leads", "outreach", user)
    doc.pop("_id", None)
    return {"status": "success", "campaign": serialize_doc(doc) if "_id" in doc else doc}


@router.post("/preview")
async def preview(body: dict, user=Depends(get_current_user)):
    lead = body.get("lead", {})
    settings_data = get_settings()
    out = {"status": "success"}

    blocks = body.get("blocks")
    if blocks:
        rendered = render_blocks(blocks, lead, settings_data)
        out["html"] = rendered["html"]
        out["message"] = rendered["text"]
    else:
        tpl_body = body.get("body", "")
        if not tpl_body:
            raise HTTPException(status_code=400, detail="Template body required")
        msg = render_message(tpl_body, lead, settings_data)
        if body.get("image_url"):
            msg = f"{msg}\n\n📷 {body['image_url']}"
        out["message"] = msg

    if body.get("subject"):
        out["subject"] = render_message(body["subject"], lead, settings_data)
    return out
