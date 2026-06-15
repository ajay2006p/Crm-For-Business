from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import FolderCreate, FolderUpdate
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, serialize_many, utcnow

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("")
async def list_folders(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.folders.find({}).sort("created_at", 1).to_list(200)
    folders = serialize_many(docs)
    # attach live lead counts
    for f in folders:
        f["lead_count"] = await db.leads.count_documents({"folder_id": f["id"]})
    total = await db.leads.count_documents({})
    unfiled = await db.leads.count_documents({"folder_id": {"$in": [None, ""]}})
    return {"status": "success", "folders": folders, "total_leads": total, "unfiled": unfiled}


@router.post("")
async def create_folder(body: FolderCreate, user=Depends(get_current_user)):
    db = get_db()
    if await db.folders.find_one({"name": body.name}):
        raise HTTPException(status_code=409, detail="Folder name already exists")
    doc = body.model_dump()
    doc.update({"created_at": utcnow(), "created_by": user.get("id")})
    res = await db.folders.insert_one(doc)
    await log_activity(f"Folder created: {body.name}", "leads", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.put("/{folder_id}")
async def update_folder(folder_id: str, body: FolderUpdate, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder id")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.folders.update_one({"_id": oid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"status": "success"}


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(folder_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder id")
    # move any leads in this folder back to "unfiled" rather than deleting them
    await db.leads.update_many({"folder_id": folder_id}, {"$set": {"folder_id": None}})
    await db.folders.delete_one({"_id": oid})
    await log_activity("Folder deleted", "leads", user)
    return {"status": "success"}
