from app.core.database import get_db
from app.utils.helpers import utcnow


async def log_activity(action: str, module: str, user: dict | None = None, meta: dict | None = None):
    try:
        db = get_db()
        await db.activities.insert_one({
            "action": action,
            "module": module,
            "user_id": user.get("id") if user else None,
            "user_name": user.get("name") if user else "System",
            "meta": meta or {},
            "created_at": utcnow(),
        })
    except Exception:
        pass
