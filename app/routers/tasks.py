from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import TaskCreate
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, serialize_many, utcnow

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("")
async def list_tasks(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.tasks.find({}).sort("due_date", 1).to_list(300)
    return {"status": "success", "tasks": serialize_many(docs)}


@router.post("")
async def create_task(body: TaskCreate, user=Depends(get_current_user)):
    db = get_db()
    doc = body.model_dump()
    doc["created_at"] = utcnow()
    doc["created_by"] = user.get("id")
    res = await db.tasks.insert_one(doc)
    await log_activity(f"Task created: {doc['title']}", "tasks", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.put("/{task_id}")
async def update_task(task_id: str, body: dict, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    body.pop("id", None)
    body["updated_at"] = utcnow()
    await db.tasks.update_one({"_id": oid}, {"$set": body})
    return {"status": "success"}
