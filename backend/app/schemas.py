from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import EquipmentStatus, Role, TrackingType

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
    quantity_on_loan: int
    quantity_available: int
    is_available: bool


# ---------------------------------------------------------------- lån


class LoanCreate(BaseModel):
    equipment_id: int
    quantity: int = Field(default=1, ge=1)
    due_date: datetime | None = None
    note: str | None = None


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
    quantity: int
    borrowed_at: datetime
    due_date: datetime | None
    returned_at: datetime | None
    note: str | None
    is_active: bool
    equipment: LoanEquipmentBrief
    user: UserPublic


# ---------------------------------------------------------------- diverse


class Stats(BaseModel):
    equipment_count: int
    unit_count: int
    available_units: int
    active_loans: int
    overdue_loans: int
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
