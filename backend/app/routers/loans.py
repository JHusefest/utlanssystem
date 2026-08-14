from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import joinedload

from ..deps import CurrentUser, Db
from ..models import Equipment, EquipmentStatus, Loan, Role, TrackingType
from ..schemas import LoanCreate, LoanOut

router = APIRouter(prefix="/api/loans", tags=["lån"])


@router.get("", response_model=list[LoanOut])
def list_loans(
    db: Db,
    active: bool | None = Query(default=None, description="true = kun aktive, false = kun returnerte"),
    user_id: int | None = None,
    equipment_id: int | None = None,
    limit: int = Query(default=200, le=1000),
):
    """Åpent endepunkt – alle kan se hvem som har lånt hva."""
    query = db.query(Loan).options(joinedload(Loan.equipment), joinedload(Loan.user))

    if active is True:
        query = query.filter(Loan.returned_at.is_(None))
    elif active is False:
        query = query.filter(Loan.returned_at.isnot(None))
    if user_id:
        query = query.filter(Loan.user_id == user_id)
    if equipment_id:
        query = query.filter(Loan.equipment_id == equipment_id)

    return query.order_by(Loan.returned_at.is_(None).desc(), Loan.borrowed_at.desc()).limit(limit).all()


@router.get("/mine", response_model=list[LoanOut])
def my_loans(db: Db, user: CurrentUser, active: bool | None = None):
    query = (
        db.query(Loan)
        .options(joinedload(Loan.equipment), joinedload(Loan.user))
        .filter(Loan.user_id == user.id)
    )
    if active is True:
        query = query.filter(Loan.returned_at.is_(None))
    elif active is False:
        query = query.filter(Loan.returned_at.isnot(None))
    return query.order_by(Loan.borrowed_at.desc()).all()


@router.post("", response_model=LoanOut, status_code=status.HTTP_201_CREATED)
def create_loan(data: LoanCreate, db: Db, user: CurrentUser):
    """Registrer et lån på deg selv. Krever innlogging."""
    item = db.get(Equipment, data.equipment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Fant ikke utstyret.")

    if item.status in (EquipmentStatus.maintenance, EquipmentStatus.retired):
        raise HTTPException(
            status_code=400, detail="Utstyret er ikke tilgjengelig for utlån akkurat nå."
        )

    quantity = data.quantity
    if item.tracking_type is TrackingType.unique:
        quantity = 1
        if item.status is not EquipmentStatus.available or item.quantity_on_loan > 0:
            raise HTTPException(status_code=409, detail="Enheten er allerede utlånt.")
    else:
        if quantity > item.quantity_available:
            raise HTTPException(
                status_code=409,
                detail=f"Bare {item.quantity_available} stk er ledig nå.",
            )

    loan = Loan(
        equipment_id=item.id,
        user_id=user.id,
        quantity=quantity,
        due_date=data.due_date,
        note=(data.note or None),
    )
    db.add(loan)

    if item.tracking_type is TrackingType.unique:
        item.status = EquipmentStatus.on_loan

    db.commit()
    db.refresh(loan)
    return loan


@router.post("/{loan_id}/return", response_model=LoanOut)
def return_loan(loan_id: int, db: Db, user: CurrentUser):
    """Registrer tilbakelevering. Du kan levere inn egne lån; admin kan levere inn alle."""
    loan = db.get(Loan, loan_id)
    if loan is None:
        raise HTTPException(status_code=404, detail="Fant ikke lånet.")
    if loan.returned_at is not None:
        raise HTTPException(status_code=400, detail="Lånet er allerede levert tilbake.")
    if loan.user_id != user.id and user.role is not Role.admin:
        raise HTTPException(
            status_code=403,
            detail="Du kan bare levere inn dine egne lån. Be en administrator om hjelp.",
        )

    loan.returned_at = datetime.now(timezone.utc)
    loan.returned_by_id = user.id

    item = loan.equipment
    if item.tracking_type is TrackingType.unique and item.status is EquipmentStatus.on_loan:
        item.status = EquipmentStatus.available

    db.commit()
    db.refresh(loan)
    return loan
