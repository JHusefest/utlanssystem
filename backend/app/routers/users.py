from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentAdmin, Db, OptionalUser
from ..models import Loan, Role, User
from ..schemas import UserCreate, UserOut, UserPublic, UserUpdate
from ..security import hash_password

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
