from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.activity_service import log_activity
from app.services.qr_service import insert_qr_into_pdf
from app.utils.files import save_upload
from app.utils.helpers import parse_object_id, serialize_many, utcnow

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
async def list_documents(q: str = "", user=Depends(get_current_user)):
    db = get_db()
    query = {}
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"tags": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.documents.find(query).sort("created_at", -1).to_list(200)
    return {"status": "success", "documents": serialize_many(docs)}


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    category: str = Form("General"),
    tags: str = Form(""),
    user=Depends(get_current_user),
):
    if not title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    saved = await save_upload(file, "documents")
    db = get_db()
    doc = {
        "title": title.strip(),
        "category": category,
        "tags": [t.strip() for t in tags.split(",") if t.strip()],
        **saved,
        "created_at": utcnow(),
        "uploaded_by": user.get("id"),
    }
    res = await db.documents.insert_one(doc)
    await log_activity(f"Document uploaded: {title}", "documents", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.get("/{doc_id}/download")
async def download(doc_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        doc = await db.documents.find_one({"_id": parse_object_id(doc_id)})
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not doc or not Path(doc["path"]).exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(doc["path"], filename=doc.get("original_name", "file"))


@router.post("/qr/generate")
async def generate_qr(
    file: UploadFile = File(...),
    position: str = Form("bottom-right"),
    size: int = Form(100),
    qr_data: str = Form("https://recruitkr.com"),
    user=Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files supported")
    if size < 40 or size > 300:
        raise HTTPException(status_code=400, detail="QR size must be 40-300")
    saved = await save_upload(file, "qr_source")
    out_path = saved["path"].replace(".pdf", "_qr.pdf")
    try:
        insert_qr_into_pdf(saved["path"], out_path, qr_data, position, size)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"QR generation failed: {exc}") from exc
    db = get_db()
    record = {
        "source": saved["original_name"],
        "output_path": out_path,
        "position": position,
        "size": size,
        "qr_data": qr_data,
        "created_at": utcnow(),
        "created_by": user.get("id"),
    }
    res = await db.qr_documents.insert_one(record)
    await log_activity("QR document generated", "documents", user)
    return {"status": "success", "id": str(res.inserted_id), "download_url": f"/api/documents/qr/{res.inserted_id}/download"}


@router.get("/qr/history")
async def qr_history(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.qr_documents.find({}).sort("created_at", -1).to_list(50)
    return {"status": "success", "history": serialize_many(docs)}


@router.get("/qr/{qr_id}/download")
async def download_qr(qr_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        doc = await db.qr_documents.find_one({"_id": parse_object_id(qr_id)})
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not doc or not Path(doc["output_path"]).exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(doc["output_path"], filename=Path(doc["output_path"]).name)
