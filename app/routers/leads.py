import threading
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import LeadCreate, LeadFilter, LeadUpdate, ScrapeRequest
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, serialize_doc, serialize_many, utcnow
from scraper_logic import JOB_STATES, run_scraper

router = APIRouter(prefix="/api/leads", tags=["leads"])


def _lead_key(lead: dict) -> str:
    return f"{lead.get('name','').lower()}|{lead.get('phone_number','')}|{lead.get('address','').lower()}"


@router.get("")
async def list_leads(f: LeadFilter = Depends(), user=Depends(get_current_user)):
    db = get_db()
    query: dict = {}
    if f.status:
        query["status"] = f.status
    if f.city:
        query["city"] = {"$regex": f.city, "$options": "i"}
    if f.area:
        query["area"] = {"$regex": f.area, "$options": "i"}
    if f.has_phone is True:
        query["phone_number"] = {"$nin": ["", None]}
    if f.has_phone is False:
        query["phone_number"] = {"$in": ["", None]}
    if f.has_website is True:
        query["website"] = {"$nin": ["", None]}
    if f.has_website is False:
        query["website"] = {"$in": ["", None]}
    if f.min_rating is not None:
        query["reviews_average"] = {"$gte": f.min_rating}
    if f.q:
        query["$or"] = [
            {"name": {"$regex": f.q, "$options": "i"}},
            {"phone_number": {"$regex": f.q, "$options": "i"}},
            {"address": {"$regex": f.q, "$options": "i"}},
            {"city": {"$regex": f.q, "$options": "i"}},
        ]
    skip = (f.page - 1) * f.limit
    total = await db.leads.count_documents(query)
    docs = await db.leads.find(query).sort("created_at", -1).skip(skip).limit(f.limit).to_list(f.limit)
    return {"status": "success", "total": total, "page": f.page, "leads": serialize_many(docs)}


@router.post("")
async def create_lead(body: LeadCreate, user=Depends(get_current_user)):
    db = get_db()
    doc = body.model_dump()
    doc.update({"created_at": utcnow(), "updated_at": utcnow(), "created_by": user.get("id"),
                "activity_history": [{"action": "Created", "at": utcnow().isoformat(), "by": user.get("name")}]})
    if doc.get("phone_number"):
        dup = await db.leads.find_one({"phone_number": doc["phone_number"]})
        if dup:
            raise HTTPException(status_code=409, detail="Duplicate lead (phone already exists)")
    res = await db.leads.insert_one(doc)
    await log_activity(f"Lead created: {doc['name']}", "leads", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.put("/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdate, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(lead_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lead id")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = utcnow()
    hist = {"action": "Updated", "fields": list(updates.keys()), "at": utcnow().isoformat(), "by": user.get("name")}
    result = await db.leads.update_one({"_id": oid}, {"$set": updates, "$push": {"activity_history": hist}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"status": "success"}


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(lead_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid lead id")
    await db.leads.delete_one({"_id": oid})
    return {"status": "success"}


@router.post("/import")
async def import_leads(payload: dict, user=Depends(get_current_user)):
    leads = payload.get("leads", [])
    if not isinstance(leads, list) or not leads:
        raise HTTPException(status_code=400, detail="leads array required")
    db = get_db()
    seen = set()
    inserted = 0
    for raw in leads:
        if not raw.get("name"):
            continue
        key = _lead_key(raw)
        if key in seen:
            continue
        if raw.get("phone_number"):
            exists = await db.leads.find_one({"phone_number": raw["phone_number"]})
            if exists:
                continue
        seen.add(key)
        doc = {
            "name": raw.get("name", ""),
            "phone_number": raw.get("phone_number", ""),
            "address": raw.get("address", ""),
            "website": raw.get("website", ""),
            "city": raw.get("city", ""),
            "area": raw.get("area", ""),
            "reviews_average": raw.get("reviews_average"),
            "reviews_count": raw.get("reviews_count"),
            "status": raw.get("status", "New"),
            "notes": raw.get("notes", ""),
            "follow_up_date": raw.get("follow_up_date"),
            "created_at": utcnow(),
            "updated_at": utcnow(),
            "activity_history": [],
        }
        await db.leads.insert_one(doc)
        inserted += 1
    await log_activity(f"Imported {inserted} leads", "leads", user)
    return {"status": "success", "inserted": inserted, "skipped": len(leads) - inserted}


@router.post("/scrape")
async def start_scrape(req: ScrapeRequest, user=Depends(get_current_user)):
    if not req.business_type.strip() or not req.location.strip():
        raise HTTPException(status_code=400, detail="Business type and location are required")
    job_id = str(uuid.uuid4())
    search = f"{req.business_type.strip()} in {req.location.strip()}"
    JOB_STATES[job_id] = {
        "status": "pending", "progress": "Queued", "data": [], "log": [],
        "found": 0, "target": req.target, "current_area": "",
    }
    t = threading.Thread(
        target=run_scraper,
        args=(job_id, [search], req.target, "output", req.no_website_only, req.scope),
        daemon=True,
    )
    t.start()
    await log_activity(f"Scrape started: {search}", "leads", user, {"job_id": job_id})
    return {"status": "success", "job_id": job_id}


@router.get("/scrape/{job_id}")
async def scrape_status(job_id: str, user=Depends(get_current_user)):
    state = JOB_STATES.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status": "success",
        "job_status": state.get("status"),
        "found": state.get("found", 0),
        "target": state.get("target", 0),
        "data": state.get("data", []),
        "current_area": state.get("current_area", ""),
        "log": state.get("log", [])[-50:],
    }


@router.post("/scrape/{job_id}/save")
async def save_scrape_to_db(job_id: str, user=Depends(get_current_user)):
    state = JOB_STATES.get(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    data = state.get("data", [])
    if not data:
        raise HTTPException(status_code=400, detail="No scraped data to save")
    result = await import_leads({"leads": data}, user)
    return result
