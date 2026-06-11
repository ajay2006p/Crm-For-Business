from datetime import datetime, timezone
from typing import Any

from bson import ObjectId


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def serialize_doc(doc: dict | None) -> dict | None:
    if not doc:
        return None
    out = {k: v for k, v in doc.items() if k != "_id"}
    out["id"] = str(doc["_id"])
    for key, val in list(out.items()):
        if isinstance(val, ObjectId):
            out[key] = str(val)
        elif isinstance(val, datetime):
            out[key] = val.isoformat()
    return out


def serialize_many(docs: list[dict]) -> list[dict]:
    return [serialize_doc(d) for d in docs if d]


def parse_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise ValueError("Invalid id") from exc


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
