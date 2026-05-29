import os

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from sqlalchemy import text
from fastapi import HTTPException

from .db import Base, engine, get_db
from .models import Pet
from .mq_consumer import start_consumer
from .auth import get_current_user
from .schemas import SpendRequest, EarnRequest

from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response
import time
import logging

logger = logging.getLogger("petgame.pet")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(
    title="pet-service",
    swagger_ui_init_oauth={
        "clientId": os.getenv("KEYCLOAK_CLIENT_ID", "petgame-api"),
        "usePkceWithAuthorizationCodeGrant": True,
    },
)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HTTP_REQUESTS = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["service", "method", "path", "status"]
)

HTTP_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["service", "method", "path"]
)

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    # Dev-friendly column migration: existing pet rows pre-dated `coins`.
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE pets ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0"
            ))
    except Exception:
        logger.exception("coins column migration failed (non-fatal)")
    start_consumer()

@app.get("/api/v1/pet/me")
def get_pet(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start = time.time()
    status = "200"
    try:
        user_id = current_user["user_id"]

        pet = db.query(Pet).filter(Pet.user_id == user_id).first()

        if not pet:
            pet = Pet(
                user_id=user_id,
                name="Mochi",
                hp=100,
                xp=0,
                level=1,
                mood=5,
                streak=0
            )
            db.add(pet)
            db.commit()
            db.refresh(pet)
            logger.info("created pet user=%s name=%s hp=%d xp=%d level=%d mood=%d streak=%d",
                        user_id, pet.name, pet.hp, pet.xp, pet.level, pet.mood, pet.streak)

        logger.info("get_pet user=%s hp=%d xp=%d level=%d mood=%d streak=%d",
                    user_id, pet.hp, pet.xp, pet.level, pet.mood, pet.streak)

        return {
            "id": pet.id,
            "user_id": pet.user_id,
            "name": pet.name,
            "hp": pet.hp,
            "xp": pet.xp,
            "level": pet.level,
            "mood": pet.mood,
            "streak": pet.streak,
            "coins": pet.coins or 0
        }

    except Exception:
        status = "500"
        logger.exception("get_pet failed")
        raise

    finally:
        duration = time.time() - start
        HTTP_LATENCY.labels("pet-service", "GET", "/api/v1/pet/me").observe(duration)
        HTTP_REQUESTS.labels("pet-service", "GET", "/api/v1/pet/me", status).inc()


@app.post("/api/v1/pet/spend")
def spend_coins(
    payload: SpendRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start = time.time()
    status = "200"
    try:
        user_id = current_user["user_id"]
        if payload.amount <= 0:
            status = "400"
            raise HTTPException(status_code=400, detail="amount must be positive")
        pet = db.query(Pet).filter(Pet.user_id == user_id).first()
        if not pet:
            status = "404"
            raise HTTPException(status_code=404, detail="pet not found")
        if (pet.coins or 0) < payload.amount:
            status = "402"
            raise HTTPException(status_code=402, detail="insufficient coins")
        pet.coins = (pet.coins or 0) - payload.amount
        db.commit()
        db.refresh(pet)
        logger.info("spend_coins user=%s amount=%d remaining=%d", user_id, payload.amount, pet.coins)
        return {
            "id": pet.id, "user_id": pet.user_id, "name": pet.name,
            "hp": pet.hp, "xp": pet.xp, "level": pet.level,
            "mood": pet.mood, "streak": pet.streak, "coins": pet.coins
        }
    except HTTPException:
        raise
    except Exception:
        status = "500"
        logger.exception("spend_coins failed")
        raise
    finally:
        duration = time.time() - start
        HTTP_LATENCY.labels("pet-service", "POST", "/api/v1/pet/spend").observe(duration)
        HTTP_REQUESTS.labels("pet-service", "POST", "/api/v1/pet/spend", status).inc()


@app.post("/api/v1/pet/earn")
def earn(
    payload: EarnRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start = time.time()
    status = "200"
    try:
        user_id = current_user["user_id"]
        pet = db.query(Pet).filter(Pet.user_id == user_id).first()
        if not pet:
            status = "404"
            raise HTTPException(status_code=404, detail="pet not found")
        pet.coins = (pet.coins or 0) + max(0, payload.coins)
        pet.xp = pet.xp + max(0, payload.xp)
        pet.level = (pet.xp // 100) + 1
        db.commit()
        db.refresh(pet)
        logger.info("earn user=%s +coins=%d +xp=%d coins=%d xp=%d", user_id, payload.coins, payload.xp, pet.coins, pet.xp)
        return {
            "id": pet.id, "user_id": pet.user_id, "name": pet.name,
            "hp": pet.hp, "xp": pet.xp, "level": pet.level,
            "mood": pet.mood, "streak": pet.streak, "coins": pet.coins
        }
    except HTTPException:
        raise
    except Exception:
        status = "500"
        logger.exception("earn failed")
        raise
    finally:
        duration = time.time() - start
        HTTP_LATENCY.labels("pet-service", "POST", "/api/v1/pet/earn").observe(duration)
        HTTP_REQUESTS.labels("pet-service", "POST", "/api/v1/pet/earn", status).inc()