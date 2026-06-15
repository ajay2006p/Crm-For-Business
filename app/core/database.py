from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.logging_config import logger

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db() -> None:
    global _client, _db
    settings = get_settings()
    try:
        _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        await _client.admin.command("ping")
        _db = _client[settings.mongodb_db]
        await ensure_indexes()
        logger.info("MongoDB connected: %s", settings.mongodb_db)
    except Exception as exc:
        logger.error("MongoDB connection failed: %s", exc)
        raise


async def close_db() -> None:
    global _client
    if _client:
        _client.close()


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialized")
    return _db


async def ensure_indexes() -> None:
    db = get_db()
    indexes = {
        "users": [("email", 1)],
        "leads": [("phone_number", 1), ("name", 1), ("city", 1), ("status", 1), ("created_at", -1), ("folder_id", 1)],
        "folders": [("name", 1), ("created_at", 1)],
        "expenses": [("date", -1), ("category", 1)],
        "quotations": [("quote_number", 1), ("created_at", -1)],
        "campaigns": [("created_at", -1)],
        "templates": [("name", 1)],
        "meetings": [("scheduled_at", 1), ("status", 1)],
        "tasks": [("status", 1), ("due_date", 1)],
        "employees": [("email", 1), ("department", 1)],
        "attendance": [("employee_id", 1), ("month", 1)],
        "leave_requests": [("employee_id", 1), ("status", 1)],
        "payroll": [("employee_id", 1), ("month", 1)],
        "holidays": [("date", 1)],
        "invoices": [("invoice_number", 1), ("created_at", -1)],
        "documents": [("title", 1), ("tags", 1)],
        "qr_documents": [("created_at", -1)],
        "activities": [("created_at", -1)],
        "settings": [("key", 1)],
    }
    for coll, fields in indexes.items():
        for field, direction in fields:
            try:
                await db[coll].create_index([(field, direction)], background=True)
            except Exception as exc:
                logger.warning("Index %s.%s skipped: %s", coll, field, exc)
