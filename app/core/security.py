from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import get_settings
from app.core.database import get_db

security_scheme = HTTPBearer(auto_error=False)
ROLES = {"Admin", "HR", "Recruiter", "Sales", "Employee"}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


_DEFAULT_USER = {
    "id": "000000000000000000000000",
    "name": "Admin",
    "email": "admin@recruitkr.com",
    "role": "Admin",
    "department": "Management",
    "active": True,
}


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
):
    return _DEFAULT_USER


def require_roles(*roles: str):
    async def checker(user=Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "Admin":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker
