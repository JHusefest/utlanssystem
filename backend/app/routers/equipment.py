import io

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_

from ..deps import CurrentAdmin, Db
from ..excel import build_template, parse_workbook
from ..models import Equipment, EquipmentStatus, Loan, TrackingType
from ..schemas import EquipmentCreate, EquipmentOut, EquipmentUpdate, ImportResult

router = APIRouter(prefix="/api/equipment", tags=["utstyr"])

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("", response_model=list[EquipmentOut])
def list_equipment(
    db: Db,
    search: str | None = Query(default=None, description="Fritekstsøk"),
    category: str | None = None,
    status_filter: EquipmentStatus | None = Query(default=None, alias="status"),
    only_available: bool = False,
):
    """Åpent endepunkt – alle kan se utstyrslista."""
    query = db.query(Equipment)

    if search:
        needle = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Equipment.name.ilike(needle),
                Equipment.category.ilike(needle),
                Equipment.serial_number.ilike(needle),
                Equipment.asset_tag.ilike(needle),
                Equipment.location.ilike(needle),
                Equipment.description.ilike(needle),
            )
        )
    if category:
        query = query.filter(Equipment.category == category)
    if status_filter:
        query = query.filter(Equipment.status == status_filter)

    items = query.order_by(Equipment.name, Equipment.serial_number).all()
    if only_available:
        items = [i for i in items if i.is_available]
    return items


@router.get("/categories", response_model=list[str])
def list_categories(db: Db):
    rows = (
        db.query(Equipment.category)
        .filter(Equipment.category.isnot(None), Equipment.category != "")
        .distinct()
        .order_by(Equipment.category)
        .all()
    )
    return [r[0] for r in rows]


@router.get("/import/template")
def download_template(admin: CurrentAdmin):
    """Last ned en tom Excel-mal med riktige kolonner."""
    buffer = build_template()
    return StreamingResponse(
        buffer,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": 'attachment; filename="utstyr-mal.xlsx"'},
    )


@router.get("/{equipment_id}", response_model=EquipmentOut)
def get_equipment(equipment_id: int, db: Db):
    item = db.get(Equipment, equipment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Fant ikke utstyret.")
    return item


@router.post("", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(data: EquipmentCreate, db: Db, admin: CurrentAdmin):
    payload = data.model_dump()
    _normalise(payload)

    if payload.get("serial_number"):
        exists = (
            db.query(Equipment)
            .filter(Equipment.serial_number == payload["serial_number"])
            .first()
        )
        if exists:
            raise HTTPException(
                status_code=409, detail="Serienummeret er allerede registrert."
            )

    item = Equipment(**payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(equipment_id: int, data: EquipmentUpdate, db: Db, admin: CurrentAdmin):
    item = db.get(Equipment, equipment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Fant ikke utstyret.")

    payload = data.model_dump(exclude_unset=True)
    _normalise(payload)

    if payload.get("serial_number"):
        exists = (
            db.query(Equipment)
            .filter(
                Equipment.serial_number == payload["serial_number"],
                Equipment.id != equipment_id,
            )
            .first()
        )
        if exists:
            raise HTTPException(
                status_code=409, detail="Serienummeret er allerede registrert."
            )

    # Ikke la admin sette status til "ledig" på noe som faktisk er utlånt
    if payload.get("status") is EquipmentStatus.available and item.quantity_on_loan > 0:
        if item.tracking_type is TrackingType.unique:
            raise HTTPException(
                status_code=400,
                detail="Enheten er utlånt. Registrer retur før du endrer status.",
            )

    for key, value in payload.items():
        setattr(item, key, value)

    if item.tracking_type is TrackingType.quantity:
        if item.quantity_total < item.quantity_on_loan:
            raise HTTPException(
                status_code=400,
                detail=f"Antall kan ikke settes lavere enn {item.quantity_on_loan} som er utlånt nå.",
            )
        item.serial_number = item.serial_number or None
        if item.status is EquipmentStatus.on_loan:
            item.status = EquipmentStatus.available

    db.commit()
    db.refresh(item)
    return item


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(equipment_id: int, db: Db, admin: CurrentAdmin):
    item = db.get(Equipment, equipment_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Fant ikke utstyret.")
    active = (
        db.query(Loan)
        .filter(Loan.equipment_id == equipment_id, Loan.returned_at.is_(None))
        .count()
    )
    if active:
        raise HTTPException(
            status_code=400,
            detail="Utstyret er utlånt. Registrer retur før du sletter.",
        )
    db.delete(item)
    db.commit()


@router.post("/import", response_model=ImportResult)
async def import_equipment(db: Db, admin: CurrentAdmin, file: UploadFile = File(...)):
    """Importer utstyr fra et Excel-ark (.xlsx)."""
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Last opp en .xlsx-fil.")

    raw = await file.read()
    try:
        rows, errors = parse_workbook(io.BytesIO(raw))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created = updated = skipped = 0

    for row_no, data in rows:
        # Hver rad kjøres i sitt eget savepoint, slik at én feilrad ikke
        # ruller tilbake radene som allerede er lest inn.
        savepoint = db.begin_nested()
        outcome: str | None = None
        try:
            serial = data.get("serial_number")
            existing = None
            if serial:
                existing = (
                    db.query(Equipment).filter(Equipment.serial_number == serial).first()
                )
            else:
                existing = (
                    db.query(Equipment)
                    .filter(
                        Equipment.name == data["name"],
                        Equipment.category.is_(data.get("category"))
                        if data.get("category") is None
                        else Equipment.category == data.get("category"),
                        Equipment.serial_number.is_(None),
                    )
                    .first()
                )

            if existing:
                for key, value in data.items():
                    setattr(existing, key, value)
                if existing.tracking_type is TrackingType.quantity:
                    if existing.quantity_total < existing.quantity_on_loan:
                        existing.quantity_total = existing.quantity_on_loan
                    if existing.status is EquipmentStatus.on_loan:
                        existing.status = EquipmentStatus.available
                outcome = "updated"
            else:
                db.add(Equipment(**data))
                outcome = "created"
            db.flush()
            savepoint.commit()
        except Exception as exc:  # noqa: BLE001
            savepoint.rollback()
            outcome = None
            skipped += 1
            errors.append({"row": row_no, "message": f"Kunne ikke lagre raden: {exc}"})

        if outcome == "created":
            created += 1
        elif outcome == "updated":
            updated += 1

    db.commit()
    return ImportResult(created=created, updated=updated, skipped=skipped, errors=errors)


def _normalise(payload: dict) -> None:
    for key in ("category", "description", "location", "serial_number", "asset_tag"):
        if key in payload and isinstance(payload[key], str):
            payload[key] = payload[key].strip() or None
    if "name" in payload and isinstance(payload["name"], str):
        payload["name"] = payload["name"].strip()
