from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.orm import joinedload

from ..deps import CurrentAdmin, CurrentUser, Db
from ..models import (
    HOLDING_STATUSES,
    Equipment,
    Loan,
    LoanStatus,
    Role,
    TrackingType,
    User,
)
from ..schemas import LoanCreate, LoanDecision, LoanOut

router = APIRouter(prefix="/api/loans", tags=["lån"])


def _with_relations(query):
    return query.options(
        joinedload(Loan.equipment),
        joinedload(Loan.user),
        joinedload(Loan.approved_by),
        joinedload(Loan.returned_by),
    )


def _get_loan(db: Db, loan_id: int) -> Loan:
    loan = db.get(Loan, loan_id)
    if loan is None:
        raise HTTPException(status_code=404, detail="Fant ikke lånet.")
    return loan


def _require_own_or_admin(loan: Loan, user: User) -> None:
    if loan.user_id != user.id and user.role is not Role.admin:
        raise HTTPException(
            status_code=403,
            detail="Du kan bare gjøre dette med dine egne lån.",
        )


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ lesing


@router.get("", response_model=list[LoanOut])
def list_loans(
    db: Db,
    status_filter: LoanStatus | None = Query(default=None, alias="status"),
    open_only: bool | None = Query(
        default=None,
        alias="open",
        description="true = kun saker som ikke er ferdig behandlet",
    ),
    user_id: int | None = None,
    equipment_id: int | None = None,
    limit: int = Query(default=500, le=2000),
):
    """Åpent endepunkt – alle kan se hvem som har lånt hva."""
    query = _with_relations(db.query(Loan))

    if status_filter is not None:
        query = query.filter(Loan.status == status_filter)
    if open_only is True:
        query = query.filter(Loan.status.in_(HOLDING_STATUSES))
    elif open_only is False:
        query = query.filter(Loan.status.notin_(HOLDING_STATUSES))
    if user_id:
        query = query.filter(Loan.user_id == user_id)
    if equipment_id:
        query = query.filter(Loan.equipment_id == equipment_id)

    return query.order_by(Loan.borrowed_at.desc(), Loan.id.desc()).limit(limit).all()


@router.get("/mine", response_model=list[LoanOut])
def my_loans(db: Db, user: CurrentUser):
    query = _with_relations(db.query(Loan)).filter(Loan.user_id == user.id)
    return query.order_by(Loan.borrowed_at.desc(), Loan.id.desc()).all()


@router.get("/queue", response_model=list[LoanOut])
def approval_queue(db: Db, admin: CurrentAdmin):
    """Saker som venter på en administrator – eldste først."""
    query = _with_relations(db.query(Loan)).filter(
        Loan.status.in_((LoanStatus.pending, LoanStatus.return_pending))
    )
    return query.order_by(Loan.borrowed_at.asc(), Loan.id.asc()).all()


# ------------------------------------------------------------- forespørsel


@router.post("", response_model=LoanOut, status_code=status.HTTP_201_CREATED)
def create_loan(data: LoanCreate, db: Db, user: CurrentUser):
    """Be om å få låne utstyr. Administratorer godkjenner sine egne med det samme."""
    item = db.get(Equipment, data.equipment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Fant ikke utstyret.")

    if not item.is_usable:
        raise HTTPException(
            status_code=400, detail="Utstyret er ikke tilgjengelig for utlån akkurat nå."
        )

    quantity = 1 if item.tracking_type is TrackingType.unique else data.quantity

    available = item.quantity_available
    if available <= 0:
        raise HTTPException(
            status_code=409,
            detail="Utstyret er allerede utlånt eller reservert av en forespørsel.",
        )
    if quantity > available:
        raise HTTPException(
            status_code=409, detail=f"Bare {available} stk er ledig nå."
        )

    is_admin = user.role is Role.admin

    loan = Loan(
        equipment_id=item.id,
        user_id=user.id,
        quantity=quantity,
        due_date=data.due_date,
        note=(data.note or None),
        status=LoanStatus.active if is_admin else LoanStatus.pending,
        approved_at=_now() if is_admin else None,
        approved_by_id=user.id if is_admin else None,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return loan


@router.post("/{loan_id}/cancel", response_model=LoanOut)
def cancel_loan(loan_id: int, db: Db, user: CurrentUser):
    """Trekk en forespørsel som ennå ikke er godkjent."""
    loan = _get_loan(db, loan_id)
    _require_own_or_admin(loan, user)

    if loan.status is not LoanStatus.pending:
        raise HTTPException(
            status_code=400,
            detail="Bare forespørsler som venter på godkjenning kan trekkes.",
        )

    loan.status = LoanStatus.cancelled
    db.commit()
    db.refresh(loan)
    return loan


# -------------------------------------------------------------- godkjenning


@router.post("/{loan_id}/approve", response_model=LoanOut)
def approve_loan(loan_id: int, data: LoanDecision, db: Db, admin: CurrentAdmin):
    """Godkjenn en forespørsel – utstyret regnes som utlevert."""
    loan = _get_loan(db, loan_id)

    if loan.status is not LoanStatus.pending:
        raise HTTPException(
            status_code=400, detail="Denne forespørselen er allerede behandlet."
        )

    # Dobbeltsjekk at det fortsatt er dekning, i tilfelle noe er endret imens.
    item = loan.equipment
    if not item.is_usable:
        raise HTTPException(
            status_code=400,
            detail="Utstyret er merket som utilgjengelig. Endre status før du godkjenner.",
        )
    capacity = item.units_total - item.quantity_on_loan
    if loan.quantity > capacity:
        raise HTTPException(
            status_code=409,
            detail=f"Det er bare dekning for {max(capacity, 0)} stk nå. Avslå forespørselen, eller juster antallet på utstyret.",
        )

    loan.status = LoanStatus.active
    loan.approved_at = _now()
    loan.approved_by_id = admin.id
    if data.note:
        loan.decision_note = data.note.strip() or None

    db.commit()
    db.refresh(loan)
    return loan


@router.post("/{loan_id}/reject", response_model=LoanOut)
def reject_loan(loan_id: int, data: LoanDecision, db: Db, admin: CurrentAdmin):
    """Avslå en forespørsel. Utstyret frigis til andre."""
    loan = _get_loan(db, loan_id)

    if loan.status is not LoanStatus.pending:
        raise HTTPException(
            status_code=400, detail="Denne forespørselen er allerede behandlet."
        )

    loan.status = LoanStatus.rejected
    loan.approved_at = _now()
    loan.approved_by_id = admin.id
    loan.decision_note = (data.note or "").strip() or None

    db.commit()
    db.refresh(loan)
    return loan


# ------------------------------------------------------------------ retur


@router.post("/{loan_id}/request-return", response_model=LoanOut)
def request_return(loan_id: int, db: Db, user: CurrentUser):
    """Meld inn at utstyret er levert. En administrator må bekrefte."""
    loan = _get_loan(db, loan_id)
    _require_own_or_admin(loan, user)

    if loan.status is not LoanStatus.active:
        if loan.status is LoanStatus.return_pending:
            raise HTTPException(
                status_code=400, detail="Returen er allerede meldt inn og venter på bekreftelse."
            )
        raise HTTPException(status_code=400, detail="Dette lånet er ikke aktivt.")

    loan.status = LoanStatus.return_pending
    loan.return_requested_at = _now()

    db.commit()
    db.refresh(loan)
    return loan


@router.post("/{loan_id}/reject-return", response_model=LoanOut)
def reject_return(loan_id: int, data: LoanDecision, db: Db, admin: CurrentAdmin):
    """Utstyret sto ikke i skapet likevel – lånet settes tilbake til aktivt."""
    loan = _get_loan(db, loan_id)

    if loan.status is not LoanStatus.return_pending:
        raise HTTPException(
            status_code=400, detail="Det finnes ingen innmeldt retur å avvise her."
        )

    loan.status = LoanStatus.active
    loan.return_requested_at = None
    loan.decision_note = (data.note or "").strip() or None

    db.commit()
    db.refresh(loan)
    return loan


@router.post("/{loan_id}/confirm-return", response_model=LoanOut)
def confirm_return(loan_id: int, data: LoanDecision, db: Db, admin: CurrentAdmin):
    """Bekreft at utstyret faktisk står i skapet igjen. Først nå blir det ledig."""
    loan = _get_loan(db, loan_id)

    if loan.status not in (LoanStatus.active, LoanStatus.return_pending):
        raise HTTPException(
            status_code=400, detail="Dette lånet er allerede avsluttet."
        )

    loan.status = LoanStatus.returned
    loan.returned_at = _now()
    loan.returned_by_id = admin.id
    if data.note:
        note = data.note.strip()
        loan.decision_note = note or loan.decision_note

    db.commit()
    db.refresh(loan)
    return loan
