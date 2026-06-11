from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import get_current_user
from app.utils.helpers import serialize_many

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(user=Depends(get_current_user)):
    db = get_db()
    try:
        total_leads = await db.leads.count_documents({})
        contacted = await db.leads.count_documents({"status": {"$in": ["Contacted", "Interested", "Meeting Scheduled", "Client"]}})
        meetings = await db.meetings.count_documents({})
        employees = await db.employees.count_documents({})
        payroll_docs = await db.payroll.find({}).to_list(500)
        revenue = sum(float(p.get("net_salary", 0)) for p in payroll_docs)
        invoice_docs = await db.invoices.find({}).to_list(500)
        invoice_total = sum(float(i.get("total", 0)) for i in invoice_docs)
        activities = serialize_many(
            await db.activities.find({}).sort("created_at", -1).limit(15).to_list(15)
        )
        return {
            "status": "success",
            "data": {
                "total_leads": total_leads,
                "contacted_leads": contacted,
                "meetings": meetings,
                "employees": employees,
                "payroll_total": round(revenue, 2),
                "revenue_total": round(invoice_total, 2),
                "activities": activities,
            },
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc), "data": {}}
