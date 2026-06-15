from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import get_current_user
from app.utils.helpers import serialize_many

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def global_search(q: str = "", user=Depends(get_current_user)):
    q = (q or "").strip()
    if len(q) < 2:
        return {"status": "success", "results": []}
    db = get_db()
    rx = {"$regex": q, "$options": "i"}
    results = []

    leads = await db.leads.find(
        {"$or": [{"name": rx}, {"phone_number": rx}, {"city": rx}]}
    ).limit(6).to_list(6)
    for l in serialize_many(leads):
        results.append({"type": "lead", "tab": "leads", "id": l["id"],
                        "title": l.get("name", ""),
                        "sub": l.get("phone_number") or l.get("city") or l.get("status", "")})

    companies = await db.companies.find(
        {"$or": [{"name": rx}, {"contact_person": rx}, {"phone": rx}]}
    ).limit(6).to_list(6)
    for c in serialize_many(companies):
        results.append({"type": "company", "tab": "companies", "id": c["id"],
                        "title": c.get("name", ""),
                        "sub": c.get("industry") or c.get("city") or ""})

    employees = await db.employees.find(
        {"$or": [{"name": rx}, {"email": rx}, {"department": rx}]}
    ).limit(6).to_list(6)
    for e in serialize_many(employees):
        results.append({"type": "employee", "tab": "employees", "id": e["id"],
                        "title": e.get("name", ""),
                        "sub": e.get("designation") or e.get("department") or ""})

    return {"status": "success", "results": results}
