from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, serialize_many, utcnow

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("")
async def list_companies(
    q: str = Query(""),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
):
    db = get_db()
    query: dict = {}
    if q.strip():
        query["$or"] = [
            {"name": {"$regex": q.strip(), "$options": "i"}},
            {"industry": {"$regex": q.strip(), "$options": "i"}},
            {"city": {"$regex": q.strip(), "$options": "i"}},
        ]
    skip = (page - 1) * limit
    total = await db.companies.count_documents(query)
    docs = await db.companies.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"status": "success", "total": total, "page": page, "companies": serialize_many(docs)}


@router.post("")
async def create_company(body: dict, user=Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    db = get_db()
    existing = await db.companies.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=409, detail="Company already exists")
    doc = {
        "name": name,
        "industry": body.get("industry", ""),
        "website": body.get("website", ""),
        "phone": body.get("phone", ""),
        "email": body.get("email", ""),
        "city": body.get("city", ""),
        "address": body.get("address", ""),
        "contact_person": body.get("contact_person", ""),
        "notes": body.get("notes", ""),
        "status": body.get("status", "Active"),
        "created_at": utcnow(),
        "updated_at": utcnow(),
        "created_by": user.get("id"),
    }
    res = await db.companies.insert_one(doc)
    await log_activity(f"Company created: {name}", "companies", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.put("/{company_id}")
async def update_company(company_id: str, body: dict, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(company_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company id")
    allowed = {"name", "industry", "website", "phone", "email", "city", "address", "contact_person", "notes", "status"}
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    updates["updated_at"] = utcnow()
    result = await db.companies.update_one({"_id": oid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"status": "success"}


@router.delete("/{company_id}")
async def delete_company(company_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(company_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid company id")
    result = await db.companies.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    await log_activity(f"Company deleted: {company_id}", "companies", user)
    return {"status": "success"}
