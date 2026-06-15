import io
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.schemas import ExpenseCreate, InvoiceCreate, QuotationCreate
from app.services.activity_service import log_activity
from app.utils.helpers import parse_object_id, safe_float, serialize_many, utcnow

router = APIRouter(prefix="/api/finance", tags=["finance"])


def _sum_items(items: list[dict]) -> float:
    subtotal = 0.0
    for item in items:
        qty = float(item.get("qty", 1))
        price = float(item.get("price", 0))
        if qty <= 0 or price < 0:
            raise HTTPException(status_code=400, detail="Invalid item qty/price")
        subtotal += qty * price
    return subtotal


@router.get("/invoices")
async def list_invoices(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.invoices.find({}).sort("created_at", -1).to_list(200)
    return {"status": "success", "invoices": serialize_many(docs)}


@router.post("/invoices")
async def create_invoice(body: InvoiceCreate, user=Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one line item required")
    subtotal = 0.0
    for item in body.items:
        qty = float(item.get("qty", 1))
        price = float(item.get("price", 0))
        if qty <= 0 or price < 0:
            raise HTTPException(status_code=400, detail="Invalid item qty/price")
        subtotal += qty * price
    gst_amount = round(subtotal * body.gst_percent / 100, 2)
    total = round(subtotal + gst_amount, 2)
    db = get_db()
    count = await db.invoices.count_documents({})
    invoice_number = f"INV-{utcnow().year}-{count + 1:04d}"
    doc = body.model_dump()
    doc.update({
        "invoice_number": invoice_number,
        "subtotal": subtotal,
        "gst_amount": gst_amount,
        "total": total,
        "created_at": utcnow(),
        "created_by": user.get("id"),
    })
    res = await db.invoices.insert_one(doc)
    await log_activity(f"Invoice {invoice_number} created", "finance", user)
    return {"status": "success", "id": str(res.inserted_id), "invoice_number": invoice_number, "total": total}


@router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        inv = await db.invoices.find_one({"_id": parse_object_id(invoice_id)})
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    Path("uploads/invoices").mkdir(parents=True, exist_ok=True)
    path = f"uploads/invoices/{inv['invoice_number']}.pdf"
    c = canvas.Canvas(path, pagesize=A4)
    y = 800
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, f"Invoice {inv['invoice_number']}")
    y -= 30
    c.setFont("Helvetica", 11)
    c.drawString(50, y, f"Client: {inv.get('client_name', '')}")
    y -= 20
    for item in inv.get("items", []):
        line = f"{item.get('description','Item')} x{item.get('qty',1)} @ {item.get('price',0)}"
        c.drawString(50, y, line)
        y -= 18
    y -= 10
    c.drawString(50, y, f"Subtotal: {inv.get('subtotal', 0)}")
    y -= 18
    c.drawString(50, y, f"GST ({inv.get('gst_percent',0)}%): {inv.get('gst_amount', 0)}")
    y -= 18
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, f"Total: {inv.get('total', 0)}")
    c.save()
    return FileResponse(path, filename=f"{inv['invoice_number']}.pdf")


# ── Expenses ────────────────────────────────────────────────────────────────

@router.get("/expenses")
async def list_expenses(month: str = "", category: str = "", user=Depends(get_current_user)):
    db = get_db()
    query: dict = {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    if category:
        query["category"] = category
    docs = await db.expenses.find(query).sort("date", -1).to_list(500)
    expenses = serialize_many(docs)
    total = sum(safe_float(e.get("amount")) for e in expenses)
    by_cat: dict = {}
    for e in expenses:
        c = e.get("category") or "General"
        by_cat[c] = round(by_cat.get(c, 0) + safe_float(e.get("amount")), 2)
    return {"status": "success", "expenses": expenses, "total": round(total, 2), "by_category": by_cat}


@router.post("/expenses")
async def create_expense(body: ExpenseCreate, user=Depends(get_current_user)):
    db = get_db()
    doc = body.model_dump()
    doc["date"] = doc.get("date") or utcnow().date().isoformat()
    doc.update({"created_at": utcnow(), "created_by": user.get("id")})
    res = await db.expenses.insert_one(doc)
    await log_activity(f"Expense added: {body.title} ({body.amount})", "finance", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        oid = parse_object_id(expense_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    await db.expenses.delete_one({"_id": oid})
    return {"status": "success"}


# ── Quotations ──────────────────────────────────────────────────────────────

@router.get("/quotations")
async def list_quotations(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.quotations.find({}).sort("created_at", -1).to_list(200)
    return {"status": "success", "quotations": serialize_many(docs)}


@router.post("/quotations")
async def create_quotation(body: QuotationCreate, user=Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one line item required")
    subtotal = _sum_items(body.items)
    gst_amount = round(subtotal * body.gst_percent / 100, 2)
    total = round(subtotal + gst_amount, 2)
    db = get_db()
    count = await db.quotations.count_documents({})
    quote_number = f"QT-{utcnow().year}-{count + 1:04d}"
    doc = body.model_dump()
    doc.update({
        "quote_number": quote_number,
        "subtotal": subtotal,
        "gst_amount": gst_amount,
        "total": total,
        "status": "Sent",
        "created_at": utcnow(),
        "created_by": user.get("id"),
    })
    res = await db.quotations.insert_one(doc)
    await log_activity(f"Quotation {quote_number} created", "finance", user)
    return {"status": "success", "id": str(res.inserted_id), "quote_number": quote_number, "total": total}


@router.get("/quotations/{quote_id}/pdf")
async def quotation_pdf(quote_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        q = await db.quotations.find_one({"_id": parse_object_id(quote_id)})
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    Path("uploads/quotations").mkdir(parents=True, exist_ok=True)
    path = f"uploads/quotations/{q['quote_number']}.pdf"
    c = canvas.Canvas(path, pagesize=A4)
    y = 800
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, f"Quotation {q['quote_number']}")
    y -= 30
    c.setFont("Helvetica", 11)
    c.drawString(50, y, f"Client: {q.get('client_name', '')}")
    y -= 18
    if q.get("valid_until"):
        c.drawString(50, y, f"Valid until: {q.get('valid_until')}")
        y -= 18
    y -= 6
    for item in q.get("items", []):
        line = f"{item.get('description','Item')} x{item.get('qty',1)} @ {item.get('price',0)}"
        c.drawString(50, y, line)
        y -= 18
    y -= 10
    c.drawString(50, y, f"Subtotal: {q.get('subtotal', 0)}")
    y -= 18
    c.drawString(50, y, f"GST ({q.get('gst_percent',0)}%): {q.get('gst_amount', 0)}")
    y -= 18
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, f"Total: {q.get('total', 0)}")
    c.save()
    return FileResponse(path, filename=f"{q['quote_number']}.pdf")
