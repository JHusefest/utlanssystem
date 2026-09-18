import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError

from .config import settings
from .database import Base, SessionLocal, engine
from .models import Role, User
from .routers import auth, equipment, loans, stats, users
from .security import hash_password

log = logging.getLogger("uvicorn.error")


def wait_for_db(retries: int = 30, delay: float = 2.0) -> None:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(select(1))
            return
        except OperationalError as exc:
            last_error = exc
            reason = str(getattr(exc, "orig", exc)).strip().splitlines()[0]
            log.warning("Venter på databasen (forsøk %s/%s): %s", attempt, retries, reason)
            time.sleep(delay)
    raise RuntimeError(f"Fikk ikke kontakt med databasen. Siste feil: {last_error}")


def migrate_schema() -> None:
    """Idempotente skjemaendringer for databaser laget før godkjenningsflyten.

    Prosjektet bruker ikke Alembic. `create_all` lager nye tabeller, men rører
    ikke tabeller som allerede finnes – derfor legges nye kolonner til her.
    Alt kan kjøres om igjen uten bivirkninger.
    """
    statements = [
        # Enum-typen finnes ikke fra før hvis loans-tabellen ble laget tidligere.
        """
        DO $$ BEGIN
            CREATE TYPE loan_status AS ENUM
                ('pending', 'active', 'return_pending', 'returned', 'rejected', 'cancelled');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """,
        "ALTER TABLE loans ADD COLUMN IF NOT EXISTS status loan_status",
        "ALTER TABLE loans ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ",
        "ALTER TABLE loans ADD COLUMN IF NOT EXISTS approved_by_id INTEGER"
        " REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE loans ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ",
        "ALTER TABLE loans ADD COLUMN IF NOT EXISTS decision_note TEXT",
        # Gamle lån: alt som ikke var levert regnes som aktivt og godkjent.
        """
        UPDATE loans
           SET status = CASE
                   WHEN returned_at IS NOT NULL THEN 'returned'::loan_status
                   ELSE 'active'::loan_status
               END
         WHERE status IS NULL
        """,
        "UPDATE loans SET approved_at = borrowed_at"
        " WHERE approved_at IS NULL AND status IN ('active', 'returned')",
        "ALTER TABLE loans ALTER COLUMN status SET DEFAULT 'pending'",
        "ALTER TABLE loans ALTER COLUMN status SET NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_loans_status ON loans (status)",
        # Utstyr merket «utlånt» i en tidligere versjon: nå styres dette av lånene.
        "UPDATE equipment SET status = 'available' WHERE status = 'on_loan'",
    ]

    with engine.begin() as conn:
        for sql in statements:
            conn.execute(text(sql))
    log.info("Skjemaet er oppdatert.")


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
    migrate_schema()
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
