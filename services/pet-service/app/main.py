import os

from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Pet
from .mq_consumer import start_consumer
from .auth import get_current_user

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
            "streak": pet.streak
        }

    except Exception:
        status = "500"
        logger.exception("get_pet failed")
        raise

    finally:
        duration = time.time() - start
        HTTP_LATENCY.labels("pet-service", "GET", "/api/v1/pet/me").observe(duration)
        HTTP_REQUESTS.labels("pet-service", "GET", "/api/v1/pet/me", status).inc()