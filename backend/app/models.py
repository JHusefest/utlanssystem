import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Role(str, enum.Enum):
    admin = "admin"
    user = "user"


class TrackingType(str, enum.Enum):
    """unique = én fysisk enhet med serienummer. quantity = antall like ting."""

    unique = "unique"
    quantity = "quantity"


class EquipmentStatus(str, enum.Enum):
    available = "available"   # ledig
    on_loan = "on_loan"       # utlånt (kun for unike enheter)
    maintenance = "maintenance"  # til service / defekt
    retired = "retired"       # utrangert


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    school_class: Mapped[str | None] = mapped_column(String(40), nullable=True)
    role: Mapped[Role] = mapped_column(SAEnum(Role, name="role"), default=Role.user)
    hashed_password: Mapped[str] = mapped_column(String(200))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Loan peker på User to ganger (user_id og returned_by_id), derfor må vi
    # si eksplisitt hvilken nøkkel denne relasjonen følger.
    loans: Mapped[list["Loan"]] = relationship(
        back_populates="user", foreign_keys="Loan.user_id"
    )


class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (UniqueConstraint("serial_number", name="uq_equipment_serial"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    category: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)

    tracking_type: Mapped[TrackingType] = mapped_column(
        SAEnum(TrackingType, name="tracking_type"), default=TrackingType.unique
    )

    # Kun for unike enheter
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    asset_tag: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[EquipmentStatus] = mapped_column(
        SAEnum(EquipmentStatus, name="equipment_status"), default=EquipmentStatus.available
    )

    # Kun for antallsbasert utstyr
    quantity_total: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    loans: Mapped[list["Loan"]] = relationship(back_populates="equipment")

    @property
    def quantity_on_loan(self) -> int:
        return sum(loan.quantity for loan in self.loans if loan.returned_at is None)

    @property
    def quantity_available(self) -> int:
        if self.tracking_type is TrackingType.quantity:
            if self.status in (EquipmentStatus.maintenance, EquipmentStatus.retired):
                return 0
            return max(self.quantity_total - self.quantity_on_loan, 0)
        return 1 if self.status is EquipmentStatus.available else 0

    @property
    def is_available(self) -> bool:
        return self.quantity_available > 0


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    quantity: Mapped[int] = mapped_column(Integer, default=1)
    borrowed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    equipment: Mapped["Equipment"] = relationship(back_populates="loans")
    user: Mapped["User"] = relationship(back_populates="loans", foreign_keys=[user_id])

    @property
    def is_active(self) -> bool:
        return self.returned_at is None
