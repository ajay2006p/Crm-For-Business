from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(user=Depends(get_current_user)):
    db = get_db()
    try:
        pipeline_leads = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        lead_stats = await db.leads.aggregate(pipeline_leads).to_list(20)
        meeting_stats = await db.meetings.aggregate([
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]).to_list(20)
        payroll = await db.payroll.find({}).to_list(500)
        payroll_by_month: dict = {}
        for p in payroll:
            m = p.get("month", "unknown")
            payroll_by_month[m] = payroll_by_month.get(m, 0) + float(p.get("net_salary", 0))
        invoices = await db.invoices.find({}).to_list(500)
        revenue_by_month: dict = {}
        for inv in invoices:
            created = str(inv.get("created_at", ""))[:7]
            revenue_by_month[created] = revenue_by_month.get(created, 0) + float(inv.get("total", 0))
        return {
            "status": "success",
            "leads": {x["_id"]: x["count"] for x in lead_stats},
            "meetings": {x["_id"]: x["count"] for x in meeting_stats},
            "payroll_by_month": payroll_by_month,
            "revenue_by_month": revenue_by_month,
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
