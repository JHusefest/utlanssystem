import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from .config import settings
from .database import Base, SessionLocal, engine
from .models import Role, User
from .routers import auth, equipment, loans, stats, users
from .security import hash_password

log = logging.getLogger("uvicorn.error")


def wait_for_db(retries: int = 30, delay: float = 2.0) -> None:
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(select(1))
            return
        except OperationalError:
            log.warning("Venter på databasen (forsøk %s/%s)…", attempt, retries)
            time.sleep(delay)
    raise RuntimeError("Fikk ikke kontakt med databasen.")


def create_first_admin() -> None:
    with SessionLocal() as db:
        if db.query(User).count() == 0:
            admin = User(
                username=settings.first_admin_username,
                full_name=settings.first_admin_name,
                role=Role.admin,
                hashed_password=hash_password(settings.first_admin_password),
            )
            db.add(admin)
            db.commit()
            log.warning(
                "Opprettet administrator «%s». Bytt passordet med én gang.",
                settings.first_admin_username,
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    wait_for_db()
    Base.metadata.create_all(bind=engine)
    create_first_admin()
    yield


app = FastAPI(
    title="Utlånssystem",
    description="API for utlån av IT-utstyr.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(equipment.router)
app.include_router(loans.router)
app.include_router(stats.router)


@app.get("/api/health", tags=["helse"])
def health():
    return {"status": "ok"}
