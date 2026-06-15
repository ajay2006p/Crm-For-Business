from datetime import timedelta

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import get_current_user
from app.utils.helpers import safe_float, serialize_many, utcnow

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

WON_STATUSES = ["Contacted", "Interested", "Meeting Scheduled", "Client"]


@router.get("/summary")
async def summary(user=Depends(get_current_user)):
    db = get_db()
    try:
        now = utcnow()
        week_ago = (now - timedelta(days=7))
        today_iso = now.date().isoformat()

        total_leads = await db.leads.count_documents({})
        contacted = await db.leads.count_documents({"status": {"$in": WON_STATUSES}})
        clients = await db.leads.count_documents({"status": "Client"})
        new_this_week = await db.leads.count_documents({"created_at": {"$gte": week_ago}})
        meetings = await db.meetings.count_documents({})
        upcoming_meetings = await db.meetings.count_documents({"status": "Scheduled"})
        employees = await db.employees.count_documents({})
        open_tasks = await db.tasks.count_documents({"status": {"$ne": "Done"}})
        pending_leave = await db.leave_requests.count_documents({"status": "Pending"})

        payroll_docs = await db.payroll.find({}).to_list(500)
        payroll_total = sum(safe_float(p.get("net_salary")) for p in payroll_docs)
        invoice_docs = await db.invoices.find({}).to_list(500)
        invoice_total = sum(safe_float(i.get("total")) for i in invoice_docs)
        expense_docs = await db.expenses.find({}).to_list(1000)
        expense_total = sum(safe_float(e.get("amount")) for e in expense_docs)

        conversion = round((clients / total_leads * 100), 1) if total_leads else 0.0

        # follow-ups due today or overdue
        due_followups = serialize_many(
            await db.leads.find({
                "follow_up_date": {"$nin": ["", None], "$lte": today_iso},
            }).sort("follow_up_date", 1).limit(8).to_list(8)
        )
        recent_leads = serialize_many(
            await db.leads.find({}).sort("created_at", -1).limit(6).to_list(6)
        )
        activities = serialize_many(
            await db.activities.find({}).sort("created_at", -1).limit(15).to_list(15)
        )
        return {
            "status": "success",
            "data": {
                "total_leads": total_leads,
                "contacted_leads": contacted,
                "clients": clients,
                "new_this_week": new_this_week,
                "conversion_rate": conversion,
                "meetings": meetings,
                "upcoming_meetings": upcoming_meetings,
                "employees": employees,
                "open_tasks": open_tasks,
                "pending_leave": pending_leave,
                "payroll_total": round(payroll_total, 2),
                "revenue_total": round(invoice_total, 2),
                "expense_total": round(expense_total, 2),
                "net_total": round(invoice_total - expense_total, 2),
                "due_followups": due_followups,
                "recent_leads": recent_leads,
                "activities": activities,
            },
        }
    except Exception as exc:
        return {"status": "error", "message": str(exc), "data": {}}
