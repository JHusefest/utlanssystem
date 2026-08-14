from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUser, Db
from ..models import User
from ..schemas import ChangePassword, LoginRequest, Token, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Db):
    user = db.query(User).filter(User.username == data.username.strip()).first()
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Feil brukernavn eller passord.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Brukeren er deaktivert. Kontakt en administrator.",
        )
    token = create_access_token(user.id, user.role.value)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: ChangePassword, user: CurrentUser, db: Db):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Nåværende passord er feil.")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
