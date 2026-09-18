from datetime import datetime, timezone

from fastapi import APIRouter

from ..deps import Db
from ..models import Equipment, Loan, LoanStatus, OUT_STATUSES, User
from ..schemas import Stats

router = APIRouter(prefix="/api", tags=["statistikk"])


@router.get("/stats", response_model=Stats)
def stats(db: Db):
    items = db.query(Equipment).all()

    unit_count = sum(i.units_total for i in items)
    available_units = sum(i.quantity_available for i in items)

    active_loans = db.query(Loan).filter(Loan.status.in_(OUT_STATUSES)).count()
    overdue = (
        db.query(Loan)
        .filter(
            Loan.status.in_(OUT_STATUSES),
            Loan.due_date.isnot(None),
            Loan.due_date < datetime.now(timezone.utc),
        )
        .count()
    )
    pending_requests = (
        db.query(Loan).filter(Loan.status == LoanStatus.pending).count()
    )
    pending_returns = (
        db.query(Loan).filter(Loan.status == LoanStatus.return_pending).count()
    )

    return Stats(
        equipment_count=len(items),
        unit_count=unit_count,
        available_units=available_units,
        active_loans=active_loans,
        overdue_loans=overdue,
        pending_requests=pending_requests,
        pending_returns=pending_returns,
        user_count=db.query(User).count(),
    )
