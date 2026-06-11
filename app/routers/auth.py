from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.core.config import get_settings
from app.models.schemas import LoginRequest, TokenResponse, UserCreate
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, serialize_doc, serialize_many, utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    db = get_db()
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": str(user["_id"]), "role": user.get("role")})
    safe = serialize_doc(user)
    safe.pop("password", None)
    await log_activity("User logged in", "auth", safe)
    return TokenResponse(access_token=token, user=safe)


@router.get("/me")
async def me(user=Depends(get_current_user)):
    user.pop("password", None)
    return {"status": "success", "user": user}


@router.post("/register")
async def register(req: UserCreate, user=Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Only Admin can create users")
    db = get_db()
    if await db.users.find_one({"email": req.email.lower()}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "name": req.name.strip(),
        "email": req.email.lower(),
        "password": hash_password(req.password),
        "role": req.role,
        "department": req.department,
        "active": True,
        "created_at": utcnow(),
    }
    res = await db.users.insert_one(doc)
    await log_activity(f"Created user {req.email}", "users", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.get("/users")
async def list_users(user=Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db = get_db()
    docs = await db.users.find({}, {"password": 0}).sort("created_at", -1).to_list(200)
    return {"status": "success", "users": serialize_many(docs)}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(get_current_user)):
    if user.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db = get_db()
    try:
        oid = parse_object_id(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")
    if str(oid) == user.get("id"):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    result = await db.users.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success"}


async def seed_admin():
    settings = get_settings()
    db = get_db()
    exists = await db.users.find_one({"email": settings.default_admin_email.lower()})
    if exists:
        return
    await db.users.insert_one({
        "name": "Admin",
        "email": settings.default_admin_email.lower(),
        "password": hash_password(settings.default_admin_password),
        "role": "Admin",
        "department": "Management",
        "active": True,
        "created_at": utcnow(),
    })
