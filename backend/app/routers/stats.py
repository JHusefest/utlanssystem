from datetime import datetime, timezone

from fastapi import APIRouter

from ..deps import Db
from ..models import Equipment, Loan, TrackingType, User
from ..schemas import Stats

router = APIRouter(prefix="/api", tags=["statistikk"])


@router.get("/stats", response_model=Stats)
def stats(db: Db):
    items = db.query(Equipment).all()

    unit_count = sum(
        1 if i.tracking_type is TrackingType.unique else i.quantity_total for i in items
    )
    available_units = sum(i.quantity_available for i in items)

    active_loans = db.query(Loan).filter(Loan.returned_at.is_(None)).count()
    overdue = (
        db.query(Loan)
        .filter(
            Loan.returned_at.is_(None),
            Loan.due_date.isnot(None),
            Loan.due_date < datetime.now(timezone.utc),
        )
        .count()
    )

    return Stats(
        equipment_count=len(items),
        unit_count=unit_count,
        available_units=available_units,
        active_loans=active_loans,
        overdue_loans=overdue,
        user_count=db.query(User).count(),
    )
