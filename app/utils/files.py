import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.core.config import get_settings


def validate_upload(file: UploadFile) -> str:
    settings = get_settings()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.allowed_doc_ext:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")
    return ext


async def save_upload(file: UploadFile, subfolder: str) -> dict:
    settings = get_settings()
    ext = validate_upload(file)
    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.max_upload_mb}MB limit")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file upload")

    folder = Path(settings.upload_dir) / subfolder
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4().hex}{ext}"
    path = folder / stored
    path.write_bytes(content)
    return {
        "stored_name": stored,
        "original_name": file.filename,
        "path": str(path).replace("\\", "/"),
        "size": len(content),
        "ext": ext,
    }
