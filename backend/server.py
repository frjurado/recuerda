from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta, timezone, date, time
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------------------- Models ----------------------

class SessionRequest(BaseModel):
    id_token: str

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None

class EventCreate(BaseModel):
    name: str
    day: int = Field(ge=1, le=31)
    month: int = Field(ge=1, le=12)
    type: str = Field(default="cumpleanos")  # cumpleanos | aniversario | otro

class EventUpdate(BaseModel):
    name: Optional[str] = None
    day: Optional[int] = Field(default=None, ge=1, le=31)
    month: Optional[int] = Field(default=None, ge=1, le=12)
    type: Optional[str] = None

class EventOut(BaseModel):
    id: str
    name: str
    day: int
    month: int
    type: str

class SettingsUpdate(BaseModel):
    notifications_enabled: Optional[bool] = None
    notification_hour: Optional[int] = Field(default=None, ge=0, le=23)
    notification_minute: Optional[int] = Field(default=None, ge=0, le=59)
    day_start_hour: Optional[int] = Field(default=None, ge=0, le=23)

class SettingsOut(BaseModel):
    notifications_enabled: bool = True
    notification_hour: int = 9
    notification_minute: int = 0
    day_start_hour: int = 0

class ReviewGrade(BaseModel):
    card_id: str
    grade: int  # 0=Again, 1=Hard, 2=Good, 3=Easy
    utc_offset_minutes: int = 0  # client sends: -new Date().getTimezoneOffset()

class FlashCard(BaseModel):
    card_id: str
    event_id: str
    event_name: str
    event_day: int
    event_month: int
    event_type: str
    kind: str  # 'sm2_name' (memorize date for name) | 'week_before' | 'month_before' | 'birthday'
    question: str
    answer: str
    festive: bool = False

# ---------------------- Helpers ----------------------

def normalize_dt(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

async def get_user_from_token(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Falta token de autenticación")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sesión inválida")
    expires_at = normalize_dt(session.get("expires_at"))
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Sesión expirada")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

MONTH_NAMES_ES = [
    "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
]

def format_date_es(day: int, month: int) -> str:
    return f"{day} de {MONTH_NAMES_ES[month]}"

def days_until(day: int, month: int, today: date) -> int:
    """Days until the next occurrence of (day/month). 0 means today."""
    try:
        target = date(today.year, month, day)
    except ValueError:
        # e.g., Feb 29 in non-leap years -> use Feb 28
        target = date(today.year, month, min(day, 28))
    if target < today:
        try:
            target = date(today.year + 1, month, day)
        except ValueError:
            target = date(today.year + 1, month, min(day, 28))
    return (target - today).days

# ---------------------- SM-2 Algorithm ----------------------

def sm2_update(card: dict, grade: int, day_start_hour: int = 0, utc_offset_minutes: int = 0) -> dict:
    """SM-2 algorithm. grade: 0=Again, 1=Hard, 2=Good, 3=Easy.

    due_at is set to the start of the Nth local day (day_start_hour) converted to UTC,
    so scheduling works per calendar day rather than per exact clock time.
    """
    ef = card.get("ef", 2.5)
    interval = card.get("interval", 0)
    reps = card.get("repetitions", 0)

    if grade == 0:  # Again
        reps = 0
        interval = 1
        ef = max(1.3, ef - 0.2)
    else:
        # Map grade to SM-2 quality (0-5 scale). We use 1=q3, 2=q4, 3=q5
        if grade == 1:  # Hard
            q = 3
            ef = max(1.3, ef - 0.15)
        elif grade == 2:  # Good
            q = 4
        else:  # Easy
            q = 5
            ef = ef + 0.15

        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = max(1, round(interval * ef))

        if grade == 1:
            interval = max(1, round(interval * 0.7))
        elif grade == 3:
            interval = max(1, round(interval * 1.3))

        reps = reps + 1
        # Update EF using SM-2 formula refinement
        ef = max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))

    now_utc = datetime.now(timezone.utc)
    # Compute due_at as "day_start_hour on the Nth local calendar day from today"
    now_local = now_utc + timedelta(minutes=utc_offset_minutes)
    due_local_date = now_local.date() + timedelta(days=interval)
    due_local_naive = datetime.combine(due_local_date, time(day_start_hour, 0))
    due_at = due_local_naive - timedelta(minutes=utc_offset_minutes)
    due_at = due_at.replace(tzinfo=timezone.utc)

    return {
        "ef": ef,
        "interval": interval,
        "repetitions": reps,
        "due_at": due_at,
        "last_reviewed_at": now_utc,
    }

# ---------------------- Auth Routes ----------------------

@api_router.post("/auth/session")
async def auth_session(payload: SessionRequest):
    """Verify Google ID token and create/update local session."""
    GOOGLE_CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
    try:
        idinfo = google_id_token.verify_oauth2_token(
            payload.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Token de Google inválido: {e}")

    email = idinfo.get("email")
    name = idinfo.get("name", "")
    picture = idinfo.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="No se pudo obtener el email de Google")

    session_token = str(uuid.uuid4())

    # Upsert user by email
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
        })

    # Store session
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })

    # Ensure default settings exist
    settings = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        await db.settings.insert_one({
            "user_id": user_id,
            "notifications_enabled": True,
            "notification_hour": 9,
            "notification_minute": 0,
        })

    return {
        "session_token": session_token,
        "user": UserOut(user_id=user_id, email=email, name=name, picture=picture).model_dump(),
    }

@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    return UserOut(
        user_id=user["user_id"], email=user["email"],
        name=user.get("name", ""), picture=user.get("picture"),
    ).model_dump()

@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}

# ---------------------- Events Routes ----------------------

@api_router.get("/events", response_model=List[EventOut])
async def list_events(authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    items = await db.events.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(1000)
    return [EventOut(id=i["event_id"], name=i["name"], day=i["day"], month=i["month"], type=i["type"]) for i in items]

@api_router.post("/events", response_model=EventOut)
async def create_event(payload: EventCreate, authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    event_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.events.insert_one({
        "event_id": event_id,
        "user_id": user["user_id"],
        "name": payload.name,
        "day": payload.day,
        "month": payload.month,
        "type": payload.type,
        "created_at": now,
    })
    # Create SM-2 flashcard for "name -> date" memorization, due today
    await db.flashcards.insert_one({
        "card_id": str(uuid.uuid4()),
        "user_id": user["user_id"],
        "event_id": event_id,
        "ef": 2.5,
        "interval": 0,
        "repetitions": 0,
        "due_at": now,
        "last_reviewed_at": None,
        "created_at": now,
    })
    return EventOut(id=event_id, name=payload.name, day=payload.day, month=payload.month, type=payload.type)

@api_router.put("/events/{event_id}", response_model=EventOut)
async def update_event(event_id: str, payload: EventUpdate, authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.events.update_one(
        {"event_id": event_id, "user_id": user["user_id"]},
        {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    item = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    return EventOut(id=item["event_id"], name=item["name"], day=item["day"], month=item["month"], type=item["type"])

@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    res = await db.events.delete_one({"event_id": event_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    await db.flashcards.delete_many({"event_id": event_id, "user_id": user["user_id"]})
    await db.prompt_log.delete_many({"event_id": event_id, "user_id": user["user_id"]})
    return {"ok": True}

# ---------------------- Reviews / Flashcards ----------------------

async def build_due_cards(user_id: str) -> List[dict]:
    """Build list of cards due today: SM-2 due cards + calendar-triggered prompts."""
    today = datetime.now(timezone.utc).date()
    today_iso = today.isoformat()
    out: List[dict] = []

    # 1) SM-2 due cards
    sm2_cards = await db.flashcards.find(
        {"user_id": user_id, "due_at": {"$lte": datetime.now(timezone.utc)}},
        {"_id": 0},
    ).to_list(1000)

    # Batch-fetch all referenced events in a single query (avoids N+1).
    sm2_event_ids = list({c["event_id"] for c in sm2_cards})
    events_by_id: dict = {}
    if sm2_event_ids:
        cursor = db.events.find(
            {"event_id": {"$in": sm2_event_ids}, "user_id": user_id},
            {"_id": 0},
        )
        events_by_id = {e["event_id"]: e async for e in cursor}

    for c in sm2_cards:
        ev = events_by_id.get(c["event_id"])
        if not ev:
            continue
        out.append({
            "card_id": c["card_id"],
            "event_id": ev["event_id"],
            "event_name": ev["name"],
            "event_day": ev["day"],
            "event_month": ev["month"],
            "event_type": ev["type"],
            "kind": "sm2_name",
            "question": f"¿Cuándo es el cumpleaños de {ev['name']}?" if ev["type"] == "cumpleanos" else f"¿Cuándo es el evento de {ev['name']}?",
            "answer": format_date_es(ev["day"], ev["month"]),
            "festive": False,
        })

    # 2) Calendar-triggered prompts (week_before, month_before, birthday)
    # Check all user events
    events = await db.events.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    # Already-shown prompt log for today
    shown = await db.prompt_log.find(
        {"user_id": user_id, "date": today_iso},
        {"_id": 0},
    ).to_list(1000)
    shown_keys = {(s["event_id"], s["kind"]) for s in shown}

    for ev in events:
        days = days_until(ev["day"], ev["month"], today)
        if days == 0:
            kind = "birthday"
            q = f"¡Hoy es el cumpleaños de {ev['name']}!" if ev["type"] == "cumpleanos" else f"¡Hoy es el {ev['type']} de {ev['name']}!"
            a = "¡Llama o escribe para felicitar!"
            festive = True
        elif days == 7:
            kind = "week_before"
            q = "¿Quién cumple años dentro de una semana?"
            a = ev["name"]
            festive = False
        elif days == 30:
            kind = "month_before"
            q = "¿Quién cumple años dentro de un mes?"
            a = ev["name"]
            festive = False
        else:
            continue

        if (ev["event_id"], kind) in shown_keys:
            continue

        out.append({
            "card_id": f"prompt_{ev['event_id']}_{kind}_{today_iso}",
            "event_id": ev["event_id"],
            "event_name": ev["name"],
            "event_day": ev["day"],
            "event_month": ev["month"],
            "event_type": ev["type"],
            "kind": kind,
            "question": q,
            "answer": a,
            "festive": festive,
        })

    return out

@api_router.get("/reviews/due", response_model=List[FlashCard])
async def due_reviews(authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    cards = await build_due_cards(user["user_id"])
    return [FlashCard(**c) for c in cards]

@api_router.post("/reviews/grade")
async def grade_review(payload: ReviewGrade, authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    today_iso = datetime.now(timezone.utc).date().isoformat()

    if payload.card_id.startswith("prompt_"):
        # parse prompt_id: prompt_{event_id}_{kind}_{date}
        parts = payload.card_id.split("_", 1)[1]
        # event_id might contain hyphens; split by known kind suffixes
        for kind in ["birthday", "week_before", "month_before"]:
            marker = f"_{kind}_{today_iso}"
            if parts.endswith(marker):
                event_id = parts[: -len(marker)]
                await db.prompt_log.insert_one({
                    "user_id": user["user_id"],
                    "event_id": event_id,
                    "kind": kind,
                    "date": today_iso,
                    "graded_at": datetime.now(timezone.utc),
                })
                return {"ok": True}
        raise HTTPException(status_code=400, detail="Formato de card_id inválido")

    # SM-2 card
    card = await db.flashcards.find_one(
        {"card_id": payload.card_id, "user_id": user["user_id"]},
        {"_id": 0},
    )
    if not card:
        raise HTTPException(status_code=404, detail="Tarjeta no encontrada")
    user_settings = await db.settings.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    day_start_hour = user_settings.get("day_start_hour", 0)
    update = sm2_update(card, payload.grade, day_start_hour=day_start_hour, utc_offset_minutes=payload.utc_offset_minutes)
    await db.flashcards.update_one(
        {"card_id": payload.card_id, "user_id": user["user_id"]},
        {"$set": update},
    )
    return {"ok": True, "next_interval_days": update["interval"]}

@api_router.get("/reviews/has-due")
async def has_due(authorization: Optional[str] = Header(default=None)):
    """Lightweight check whether there's anything to review today."""
    user = await get_user_from_token(authorization)
    cards = await build_due_cards(user["user_id"])
    return {"count": len(cards), "has_due": len(cards) > 0}

# ---------------------- Settings ----------------------

@api_router.get("/settings", response_model=SettingsOut)
async def get_settings(authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    s = await db.settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not s:
        return SettingsOut()
    return SettingsOut(
        notifications_enabled=s.get("notifications_enabled", True),
        notification_hour=s.get("notification_hour", 9),
        notification_minute=s.get("notification_minute", 0),
        day_start_hour=s.get("day_start_hour", 0),
    )

@api_router.put("/settings", response_model=SettingsOut)
async def update_settings(payload: SettingsUpdate, authorization: Optional[str] = Header(default=None)):
    user = await get_user_from_token(authorization)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.settings.update_one(
        {"user_id": user["user_id"]},
        {"$set": update},
        upsert=True,
    )
    s = await db.settings.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return SettingsOut(
        notifications_enabled=s.get("notifications_enabled", True),
        notification_hour=s.get("notification_hour", 9),
        notification_minute=s.get("notification_minute", 0),
        day_start_hour=s.get("day_start_hour", 0),
    )

# ---------------------- Health ----------------------

@api_router.get("/")
async def root():
    return {"message": "Recuerda API ready"}

# ---------------------- Startup ----------------------

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.events.create_index([("user_id", 1), ("event_id", 1)])
    await db.flashcards.create_index([("user_id", 1), ("due_at", 1)])
    await db.flashcards.create_index("card_id")
    await db.prompt_log.create_index([("user_id", 1), ("date", 1)])
    await db.settings.create_index("user_id", unique=True)
    logger.info("Indexes ready")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
