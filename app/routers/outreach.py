from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import CampaignCreate, TemplateCreate
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, serialize_doc, serialize_many, utcnow
from messaging_service import get_settings, render_message

router = APIRouter(prefix="/api/outreach", tags=["outreach"])


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


@router.put("/templates/{template_id}")
async def update_template(template_id: str, body: TemplateCreate, user=Depends(get_current_user)):
    db = get_db()
    updates = body.model_dump()
    updates["updated_at"] = utcnow()
    res = await db.templates.update_one({"id": template_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"status": "success"}


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user=Depends(get_current_user)):
    db = get_db()
    await db.templates.delete_one({"id": template_id})
    return {"status": "success"}


@router.get("/campaigns")
async def campaigns(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.campaigns.find({}).sort("created_at", -1).limit(50).to_list(50)
    return {"status": "success", "campaigns": serialize_many(docs)}


@router.post("/campaigns")
async def create_campaign(body: CampaignCreate, user=Depends(get_current_user)):
    db = get_db()
    tpl = await db.templates.find_one({"id": body.template_id})
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
    if not leads:
        raise HTTPException(status_code=400, detail="No valid leads selected")
    from messaging_service import whatsapp_url
    settings_data = get_settings()
    messages = []
    for lead in leads:
        msg = render_message(tpl["body"], lead, settings_data)
        if tpl.get("image_url"):
            msg = f"{msg}\n\n📷 {tpl['image_url']}"
        entry = {
            "name": lead.get("name"),
            "phone": lead.get("phone_number"),
            "message": msg,
            "_idx": lead.get("id"),
            "channel": body.channel,
        }
        if body.channel == "whatsapp" and lead.get("phone_number"):
            entry["url"] = whatsapp_url(
                lead["phone_number"], msg, settings_data.get("default_country_code", "91"))
        messages.append(entry)
    campaign = {
        "status": "success",
        "template": tpl["name"],
        "channel": body.channel,
        "messages": messages,
        "ready": len(messages),
        "skipped": len(body.lead_ids) - len(messages),
    }
    doc = {**campaign, "created_at": utcnow(), "created_by": user.get("id"), "lead_count": len(leads)}
    await db.campaigns.insert_one(doc)
    if body.mark_contacted:
        for lead in leads:
            await db.leads.update_one(
                {"_id": lead["_id"]},
                {"$set": {"status": "Contacted", "updated_at": utcnow()},
                 "$push": {"activity_history": {"action": "Campaign sent", "at": utcnow().isoformat()}}},
            )
    await log_activity(f"Campaign: {tpl['name']} → {len(leads)} leads", "outreach", user)
    doc.pop("_id", None)
    return {"status": "success", "campaign": serialize_doc(doc) if "_id" in doc else doc}


@router.post("/preview")
async def preview(body: dict, user=Depends(get_current_user)):
    tpl_body = body.get("body", "")
    lead = body.get("lead", {})
    if not tpl_body:
        raise HTTPException(status_code=400, detail="Template body required")
    msg = render_message(tpl_body, lead, get_settings())
    if body.get("image_url"):
        msg = f"{msg}\n\n📷 {body['image_url']}"
    return {"status": "success", "message": msg}
