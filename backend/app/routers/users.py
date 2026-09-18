import io

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import func

from ..deps import CurrentAdmin, Db, OptionalUser
from ..models import Loan, Role, User
from ..schemas import ImportResult, UserCreate, UserOut, UserPublic, UserUpdate
from ..security import hash_password
from ..user_excel import parse_users_workbook

router = APIRouter(prefix="/api/users", tags=["brukere"])


@router.get("")
def list_users(db: Db, viewer: OptionalUser):
    """Alle kan se navnelisten, men bare admin ser detaljer som rolle og e-post."""
    users = db.query(User).order_by(User.full_name).all()
    if viewer is not None and viewer.role is Role.admin:
        return [UserOut.model_validate(u) for u in users]
    return [UserPublic.model_validate(u) for u in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, db: Db, admin: CurrentAdmin):
    username = data.username.strip()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="Brukernavnet er allerede i bruk.")
    user = User(
        username=username,
        full_name=data.full_name.strip(),
        email=(data.email or None),
        school_class=(data.school_class or None),
        role=data.role,
        is_active=data.is_active,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/import", response_model=ImportResult)
async def import_users(db: Db, admin: CurrentAdmin, file: UploadFile = File(...)):
    """Importer vanlige brukere fra et Excel-ark (Elev, Klasse, Brukernavn, Passord).

    - Administratorer i arket hoppes over.
    - Nye brukernavn opprettes som vanlige brukere.
    - Finnes brukernavnet fra før, oppdateres navn og klasse. Passordet røres
      ikke, slik at elever som har byttet passord ikke mister det.
    - Eksisterende administratorkontoer endres aldri.
    """
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Last opp en .xlsx-fil.")

    raw = await file.read()
    try:
        rows, errors, admins_skipped = parse_users_workbook(io.BytesIO(raw))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created = updated = 0
    skipped = admins_skipped + sum(
        1 for e in errors if "hoppet over" in e["message"]
    )

    for row_no, data in rows:
        savepoint = db.begin_nested()
        outcome: str | None = None
        try:
            existing = (
                db.query(User)
                .filter(func.lower(User.username) == data["username"].lower())
                .first()
            )
            if existing is not None:
                if existing.role is Role.admin:
                    errors.append(
                        {
                            "row": row_no,
                            "message": f"«{existing.username}» er en administrator i systemet – ikke endret.",
                        }
                    )
                    outcome = "skipped"
                else:
                    existing.full_name = data["full_name"]
                    existing.school_class = data["school_class"]
                    outcome = "updated"
            else:
                db.add(
                    User(
                        username=data["username"],
                        full_name=data["full_name"],
                        school_class=data["school_class"],
                        role=Role.user,
                        is_active=True,
                        hashed_password=hash_password(data["password"]),
                    )
                )
                outcome = "created"
            db.flush()
            savepoint.commit()
        except Exception as exc:  # noqa: BLE001
            savepoint.rollback()
            outcome = "skipped"
            errors.append({"row": row_no, "message": f"Kunne ikke lagre raden: {exc}"})

        if outcome == "created":
            created += 1
        elif outcome == "updated":
            updated += 1
        else:
            skipped += 1

    db.commit()
    errors.sort(key=lambda e: e["row"])
    return ImportResult(created=created, updated=updated, skipped=skipped, errors=errors)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Db, admin: CurrentAdmin):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Fant ikke brukeren.")

    payload = data.model_dump(exclude_unset=True)

    if "username" in payload and payload["username"]:
        new_username = payload["username"].strip()
        existing = db.query(User).filter(User.username == new_username, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=409, detail="Brukernavnet er allerede i bruk.")
        user.username = new_username

    if payload.get("password"):
        user.hashed_password = hash_password(payload["password"])

    # Ikke la siste aktive admin miste rollen eller bli deaktivert
    losing_admin = (payload.get("role") is not None and payload["role"] is not Role.admin) or (
        payload.get("is_active") is False
    )
    if user.role is Role.admin and losing_admin:
        other_admins = (
            db.query(User)
            .filter(User.role == Role.admin, User.is_active.is_(True), User.id != user_id)
            .count()
        )
        if other_admins == 0:
            raise HTTPException(
                status_code=400,
                detail="Du kan ikke fjerne den siste aktive administratoren.",
            )

    for field in ("full_name", "email", "school_class", "role", "is_active"):
        if field in payload:
            value = payload[field]
            if field == "full_name" and value:
                value = value.strip()
            setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Db, admin: CurrentAdmin):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Fant ikke brukeren.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Du kan ikke slette din egen bruker.")

    active_loans = (
        db.query(Loan).filter(Loan.user_id == user_id, Loan.returned_at.is_(None)).count()
    )
    if active_loans:
        raise HTTPException(
            status_code=400,
            detail=f"Brukeren har {active_loans} aktive lån. Registrer retur før sletting.",
        )

    if user.role is Role.admin:
        other_admins = (
            db.query(User)
            .filter(User.role == Role.admin, User.is_active.is_(True), User.id != user_id)
            .count()
        )
        if other_admins == 0:
            raise HTTPException(
                status_code=400, detail="Du kan ikke slette den siste administratoren."
            )

    db.delete(user)
    db.commit()
