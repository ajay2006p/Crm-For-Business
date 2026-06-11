import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.schemas import EmployeeCreate, HolidayCreate, LeaveAction, LeaveCreate, PayrollRun
from app.services.activity_service import log_activity
from app.services.payroll_service import calculate_payroll
from app.utils.helpers import parse_object_id, serialize_many, utcnow

router = APIRouter(prefix="/api/hr", tags=["hr"])


@router.get("/employees")
async def employees(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.employees.find({}).sort("name", 1).to_list(500)
    return {"status": "success", "employees": serialize_many(docs)}


@router.post("/employees")
async def create_employee(body: EmployeeCreate, user=Depends(require_roles("Admin", "HR"))):
    db = get_db()
    if await db.employees.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=409, detail="Employee email exists")
    doc = body.model_dump()
    doc["email"] = doc["email"].lower()
    doc["created_at"] = utcnow()
    res = await db.employees.insert_one(doc)
    await log_activity(f"Employee added: {doc['name']}", "hr", user)
    return {"status": "success", "id": str(res.inserted_id)}


@router.post("/attendance/upload")
async def upload_attendance(file: UploadFile = File(...), month: str = "",
                          user=Depends(require_roles("Admin", "HR"))):
    if not month:
        raise HTTPException(status_code=400, detail="month query param required (YYYY-MM)")
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Upload Excel or CSV only")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}") from exc
    if df.empty:
        raise HTTPException(status_code=400, detail="No rows in file")
    db = get_db()
    records = df.fillna("").to_dict(orient="records")
    await db.attendance.insert_one({
        "month": month,
        "records": records,
        "row_count": len(records),
        "uploaded_at": utcnow(),
        "uploaded_by": user.get("id"),
        "filename": file.filename,
    })
    await log_activity(f"Attendance uploaded for {month}", "hr", user)
    return {"status": "success", "rows": len(records)}


@router.get("/attendance")
async def list_attendance(month: str = "", user=Depends(get_current_user)):
    db = get_db()
    q = {"month": month} if month else {}
    docs = await db.attendance.find(q).sort("uploaded_at", -1).to_list(50)
    return {"status": "success", "records": serialize_many(docs)}


@router.get("/leave")
async def list_leave(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.leave_requests.find({}).sort("created_at", -1).to_list(200)
    return {"status": "success", "requests": serialize_many(docs)}


@router.post("/leave")
async def apply_leave(body: LeaveCreate, user=Depends(get_current_user)):
    db = get_db()
    try:
        parse_object_id(body.employee_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid employee id")
    doc = body.model_dump()
    doc["status"] = "Pending"
    doc["created_at"] = utcnow()
    res = await db.leave_requests.insert_one(doc)
    return {"status": "success", "id": str(res.inserted_id)}


@router.post("/leave/{req_id}/action")
async def leave_action(req_id: str, body: LeaveAction, user=Depends(require_roles("Admin", "HR"))):
    db = get_db()
    try:
        oid = parse_object_id(req_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    await db.leave_requests.update_one(
        {"_id": oid},
        {"$set": {"status": body.status, "hr_note": body.hr_note, "updated_at": utcnow()}},
    )
    return {"status": "success"}


@router.get("/holidays")
async def holidays(user=Depends(get_current_user)):
    db = get_db()
    docs = await db.holidays.find({}).sort("date", 1).to_list(100)
    return {"status": "success", "holidays": serialize_many(docs)}


@router.post("/holidays")
async def add_holiday(body: HolidayCreate, user=Depends(require_roles("Admin", "HR"))):
    db = get_db()
    doc = body.model_dump()
    doc["created_at"] = utcnow()
    res = await db.holidays.insert_one(doc)
    return {"status": "success", "id": str(res.inserted_id)}


@router.post("/payroll/run")
async def run_payroll(body: PayrollRun, user=Depends(require_roles("Admin", "HR"))):
    db = get_db()
    try:
        emp_oid = parse_object_id(body.employee_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid employee id")
    emp = await db.employees.find_one({"_id": emp_oid})
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    calc = calculate_payroll(
        float(emp.get("ctc", 0)), body.absent_days, body.leave_days,
        body.bonus, body.other_deductions,
    )
    doc = {**body.model_dump(), **calc, "employee_name": emp.get("name"),
           "created_at": utcnow(), "created_by": user.get("id")}
    await db.payroll.update_one(
        {"employee_id": body.employee_id, "month": body.month},
        {"$set": doc}, upsert=True,
    )
    await log_activity(f"Payroll run {body.month}: {emp.get('name')}", "hr", user)
    return {"status": "success", "payroll": doc}


@router.get("/payroll")
async def list_payroll(month: str = "", user=Depends(get_current_user)):
    db = get_db()
    q = {"month": month} if month else {}
    docs = await db.payroll.find(q).sort("created_at", -1).to_list(200)
    return {"status": "success", "payroll": serialize_many(docs)}
