from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import SettingsUpdate
from app.utils.helpers import serialize_doc, utcnow

router = APIRouter(prefix="/api/settings", tags=["settings"])

_DEFAULTS = {
    "your_name": "RecruitKr Admin",
    "company": "RecruitKr",
    "default_country_code": "+91",
}


@router.get("")
async def get_settings_doc(user=Depends(get_current_user)):
    db = get_db()
    doc = await db.settings.find_one({})
    base = dict(_DEFAULTS)
    if doc:
        s = serialize_doc(doc)
        s.pop("id", None)
        base.update({k: v for k, v in s.items() if v is not None})
    return {"status": "success", "settings": base}


@router.put("")
async def update_settings_doc(body: SettingsUpdate, user=Depends(get_current_user)):
    db = get_db()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"status": "success"}
    updates["updated_at"] = utcnow()
    updates["updated_by"] = user.get("id")
    await db.settings.update_one({}, {"$set": updates}, upsert=True)
    return {"status": "success"}
