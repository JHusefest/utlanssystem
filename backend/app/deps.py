from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import get_db
from .models import Role, User
from .security import decode_access_token


def _token_from_request(request: Request) -> str | None:
    header = request.headers.get("Authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


def get_current_user_optional(
    request: Request, db: Annotated[Session, Depends(get_db)]
) -> User | None:
    """Returnerer bruker hvis gyldig token finnes, ellers None. Brukes for åpne endepunkter."""
    token = _token_from_request(request)
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    try:
        user_id = int(payload.get("sub") or 0)
    except (TypeError, ValueError):
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def get_current_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Du må være innlogget for å gjøre dette.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role is not Role.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bare administratorer kan gjøre dette.",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_admin)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]
Db = Annotated[Session, Depends(get_db)]
