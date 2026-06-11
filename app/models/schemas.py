from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

LeadStatus = Literal["New", "Contacted", "Interested", "Meeting Scheduled", "Client", "Rejected"]
UserRole = Literal["Admin", "HR", "Recruiter", "Sales", "Employee"]
TaskPriority = Literal["Low", "Medium", "High", "Urgent"]
LeaveStatus = Literal["Pending", "Approved", "Rejected"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserCreate(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=6)
    role: UserRole = "Employee"
    department: str = ""


class LeadCreate(BaseModel):
    name: str = Field(min_length=1)
    phone_number: str = ""
    address: str = ""
    website: str = ""
    city: str = ""
    area: str = ""
    reviews_average: float | None = None
    reviews_count: int | None = None
    status: LeadStatus = "New"
    notes: str = ""
    follow_up_date: str | None = None


class LeadUpdate(BaseModel):
    name: str | None = None
    phone_number: str | None = None
    address: str | None = None
    website: str | None = None
    city: str | None = None
    area: str | None = None
    reviews_average: float | None = None
    reviews_count: int | None = None
    status: LeadStatus | None = None
    notes: str | None = None
    follow_up_date: str | None = None


class LeadFilter(BaseModel):
    q: str = ""
    status: str = ""
    city: str = ""
    area: str = ""
    has_phone: bool | None = None
    has_website: bool | None = None
    min_rating: float | None = None
    page: int = 1
    limit: int = 50


class ScrapeRequest(BaseModel):
    business_type: str = Field(min_length=2)
    location: str = Field(min_length=2)
    scope: Literal["city", "country"] = "city"
    target: int = Field(ge=1, le=5000, default=100)
    no_website_only: bool = False


class TemplateCreate(BaseModel):
    name: str = Field(min_length=2)
    channel: Literal["whatsapp", "sms", "email"] = "whatsapp"
    body: str = Field(min_length=5)


class CampaignCreate(BaseModel):
    template_id: str
    lead_ids: list[str] = []
    channel: str = "whatsapp"
    mark_contacted: bool = True


class MeetingCreate(BaseModel):
    title: str = Field(min_length=2)
    lead_id: str | None = None
    scheduled_at: str
    notes: str = ""
    status: str = "Scheduled"


class TaskCreate(BaseModel):
    title: str = Field(min_length=2)
    description: str = ""
    assigned_to: str | None = None
    priority: TaskPriority = "Medium"
    due_date: str | None = None
    status: str = "Open"


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    phone: str = ""
    department: str = ""
    designation: str = ""
    joining_date: str = ""
    ctc: float = Field(ge=0, default=0)


class LeaveCreate(BaseModel):
    employee_id: str
    leave_type: str = "Casual"
    start_date: str
    end_date: str
    reason: str = ""


class LeaveAction(BaseModel):
    status: LeaveStatus
    hr_note: str = ""


class HolidayCreate(BaseModel):
    title: str
    date: str
    description: str = ""


class PayrollRun(BaseModel):
    employee_id: str
    month: str
    absent_days: float = 0
    leave_days: float = 0
    bonus: float = 0
    other_deductions: float = 0


class InvoiceCreate(BaseModel):
    client_name: str
    client_email: str = ""
    items: list[dict]
    gst_percent: float = Field(ge=0, le=28, default=18)
    notes: str = ""


class DocumentMeta(BaseModel):
    title: str
    tags: list[str] = []
    category: str = "General"


class QRGenerateRequest(BaseModel):
    position: Literal["top-left", "top-right", "bottom-left", "bottom-right", "center"] = "bottom-right"
    size: int = Field(ge=40, le=300, default=100)
    bulk: bool = False


class SettingsUpdate(BaseModel):
    your_name: str | None = None
    company: str | None = None
    default_country_code: str | None = None


class APIResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    message: str = ""
    data: Any = None
