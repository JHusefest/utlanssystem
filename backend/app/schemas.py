from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import EquipmentStatus, LoanStatus, Role, TrackingType

# ---------------------------------------------------------------- auth


class LoginRequest(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


# ---------------------------------------------------------------- brukere


class UserBase(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    full_name: str = Field(min_length=1, max_length=120)
    email: str | None = None
    school_class: str | None = None
    role: Role = Role.user
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=64)
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = None
    school_class: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class UserPublic(BaseModel):
    """Begrenset brukerinfo som vises til uinnloggede."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    school_class: str | None = None


# ---------------------------------------------------------------- utstyr


class EquipmentBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: str | None = None
    description: str | None = None
    location: str | None = None
    tracking_type: TrackingType = TrackingType.unique
    serial_number: str | None = None
    asset_tag: str | None = None
    status: EquipmentStatus = EquipmentStatus.available
    quantity_total: int = Field(default=1, ge=0)


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    category: str | None = None
    description: str | None = None
    location: str | None = None
    tracking_type: TrackingType | None = None
    serial_number: str | None = None
    asset_tag: str | None = None
    status: EquipmentStatus | None = None
    quantity_total: int | None = Field(default=None, ge=0)


class EquipmentOut(EquipmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    units_total: int
    quantity_on_loan: int
    quantity_reserved: int
    quantity_available: int
    is_available: bool
    is_usable: bool


# ---------------------------------------------------------------- lån


class LoanCreate(BaseModel):
    equipment_id: int
    quantity: int = Field(default=1, ge=1)
    due_date: datetime | None = None
    note: str | None = None


class LoanDecision(BaseModel):
    """Begrunnelse ved avslag, eller merknad ved godkjenning/retur."""

    note: str | None = Field(default=None, max_length=500)


class LoanEquipmentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category: str | None = None
    serial_number: str | None = None
    tracking_type: TrackingType


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: LoanStatus
    quantity: int

    borrowed_at: datetime
    due_date: datetime | None
    approved_at: datetime | None
    return_requested_at: datetime | None
    returned_at: datetime | None

    note: str | None
    decision_note: str | None

    is_open: bool
    is_out: bool
    needs_admin: bool

    equipment: LoanEquipmentBrief
    user: UserPublic
    approved_by: UserPublic | None = None
    returned_by: UserPublic | None = None


# ---------------------------------------------------------------- diverse


class Stats(BaseModel):
    equipment_count: int
    unit_count: int
    available_units: int
    active_loans: int
    overdue_loans: int
    pending_requests: int
    pending_returns: int
    user_count: int


class ImportRowError(BaseModel):
    row: int
    message: str


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[ImportRowError]


Token.model_rebuild()
