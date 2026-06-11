from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import MeetingCreate
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, serialize_many, utcnow

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.get("")
async def list_meetings(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.meetings.find({}).sort("scheduled_at", -1).to_list(200)
    return {"status": "success", "meetings": serialize_many(docs)}


@router.post("")
async def create_meeting(body: MeetingCreate, user=Depends(get_current_user)):
    db = get_db()
    doc = body.model_dump()
    doc["created_at"] = utcnow()
    doc["created_by"] = user.get("id")
    doc["history"] = [{"action": "Created", "at": utcnow().isoformat()}]
    if doc.get("lead_id"):
        try:
            await db.leads.update_one(
                {"_id": parse_object_id(doc["lead_id"])},
                {"$set": {"status": "Meeting Scheduled", "updated_at": utcnow()}},
            )
        except ValueError:
            pass
    res = await db.meetings.insert_one(doc)
    await log_activity(f"Meeting scheduled: {doc['title']}", "meetings", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.put("/{meeting_id}")
async def update_meeting(meeting_id: str, body: dict, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(meeting_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    body.pop("id", None)
    body["updated_at"] = utcnow()
    await db.meetings.update_one({"_id": oid}, {"$set": body,
        "$push": {"history": {"action": "Updated", "at": utcnow().isoformat()}}})
    return {"status": "success"}
