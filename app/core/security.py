from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt, ExpiredSignatureError

from app.core.config import get_settings
from app.core.database import get_db
from app.utils.helpers import parse_object_id, serialize_doc

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
    # encode expiry as numeric timestamp to avoid interoperability issues
    to_encode.update({"exp": int(expire.timestamp())})
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
    settings = get_settings()
    # If authentication is disabled via config, return the default user for all requests
    if not settings.auth_required:
        return _DEFAULT_USER

    if not creds or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = creds.credentials
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    db = get_db()
    try:
        oid = parse_object_id(sub)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user id in token")

    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    safe = serialize_doc(user)
    safe.pop("password", None)
    return safe


async def get_optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
):
    try:
        return await get_current_user(creds)
    except HTTPException as exc:
        # only swallow unauthenticated errors, re-raise others
        if exc.status_code in (status.HTTP_401_UNAUTHORIZED,):
            return None
        raise


def require_roles(*roles: str):
    async def checker(user=Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "Admin":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker
