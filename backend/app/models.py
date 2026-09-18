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
    """Administrators egen merking av utstyret.

    Om noe er utlånt akkurat nå utledes fra lånene, ikke herfra – «on_loan»
    finnes bare for å kunne lese gamle rader og gamle Excel-ark.
    """

    available = "available"      # i bruk / kan lånes ut
    on_loan = "on_loan"          # utgått, behandles som available
    maintenance = "maintenance"  # til service / defekt
    retired = "retired"          # utrangert


class LoanStatus(str, enum.Enum):
    pending = "pending"                # forespurt, venter på godkjenning
    active = "active"                  # godkjent og utlevert
    return_pending = "return_pending"  # retur meldt inn, venter på bekreftelse
    returned = "returned"              # bekreftet levert tilbake
    rejected = "rejected"              # avslått av administrator
    cancelled = "cancelled"            # trukket av låntakeren selv


#: Lån som holder på utstyret – altså gjør det utilgjengelig for andre.
HOLDING_STATUSES = (
    LoanStatus.pending,
    LoanStatus.active,
    LoanStatus.return_pending,
)

#: Lån der utstyret fysisk er ute av skapet.
OUT_STATUSES = (LoanStatus.active, LoanStatus.return_pending)

#: Lån som er ferdig behandlet.
CLOSED_STATUSES = (
    LoanStatus.returned,
    LoanStatus.rejected,
    LoanStatus.cancelled,
)


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

    # Loan peker på User tre ganger (user_id, approved_by_id, returned_by_id),
    # derfor må vi si eksplisitt hvilken nøkkel denne relasjonen følger.
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

    loans: Mapped[list["Loan"]] = relationship(
        back_populates="equipment", foreign_keys="Loan.equipment_id"
    )

    # -------------------------------------------------------------- utledet

    @property
    def units_total(self) -> int:
        if self.tracking_type is TrackingType.quantity:
            return self.quantity_total
        return 1

    @property
    def is_usable(self) -> bool:
        """Administrator har ikke tatt utstyret ut av bruk."""
        return self.status not in (EquipmentStatus.maintenance, EquipmentStatus.retired)

    @property
    def quantity_on_loan(self) -> int:
        """Fysisk ute – godkjent lån eller retur som venter på bekreftelse."""
        return sum(loan.quantity for loan in self.loans if loan.status in OUT_STATUSES)

    @property
    def quantity_reserved(self) -> int:
        """Holdt av en forespørsel som ikke er behandlet ennå."""
        return sum(
            loan.quantity for loan in self.loans if loan.status is LoanStatus.pending
        )

    @property
    def quantity_available(self) -> int:
        if not self.is_usable:
            return 0
        return max(self.units_total - self.quantity_on_loan - self.quantity_reserved, 0)

    @property
    def is_available(self) -> bool:
        return self.quantity_available > 0


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    status: Mapped[LoanStatus] = mapped_column(
        SAEnum(LoanStatus, name="loan_status"), default=LoanStatus.pending, index=True
    )

    quantity: Mapped[int] = mapped_column(Integer, default=1)

    # Når forespørselen ble sendt inn
    borrowed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Godkjenning
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Retur
    return_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    returned_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    equipment: Mapped["Equipment"] = relationship(
        back_populates="loans", foreign_keys=[equipment_id]
    )
    user: Mapped["User"] = relationship(back_populates="loans", foreign_keys=[user_id])
    approved_by: Mapped["User | None"] = relationship(foreign_keys=[approved_by_id])
    returned_by: Mapped["User | None"] = relationship(foreign_keys=[returned_by_id])

    @property
    def is_open(self) -> bool:
        """Saken er ikke ferdig – står enten i kø eller er ute."""
        return self.status in HOLDING_STATUSES

    @property
    def is_out(self) -> bool:
        """Utstyret er fysisk hos låntakeren."""
        return self.status in OUT_STATUSES

    @property
    def needs_admin(self) -> bool:
        """Venter på at en administrator gjør noe."""
        return self.status in (LoanStatus.pending, LoanStatus.return_pending)
