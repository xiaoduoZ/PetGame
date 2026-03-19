import os

from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import uuid

from .db import Base, engine, get_db
from .models import InteractionLog
from .schemas import InteractionCompleteRequest
from .event_publisher import publish_interaction_completed, publish_interaction_missed
from .auth import get_current_user

from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response
import time

import logging

logger = logging.getLogger("petgame.interaction")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(
    title="interaction-service",
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


@app.get("/health")
def health():
    return {"service": "interaction-service", "status": "ok"}

@app.post("/api/v1/interactions/complete")
def complete_interaction(
    payload: InteractionCompleteRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start = time.time()
    status = "200"
    try:
        now = datetime.utcnow()
        day_key = now.strftime("%Y-%m-%d")
        user_id = current_user["user_id"]

        record = InteractionLog(
            user_id=user_id,
            template_id=payload.template_id,
            completed_at=now,
            day_key=day_key
        )

        db.add(record)
        db.commit()
        db.refresh(record)

        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "interaction.completed",
            "user_id": record.user_id,
            "template_id": record.template_id,
            "completed_at": record.completed_at.isoformat(),
            "hp_delta": 5,
            "xp_reward": 10
        }

        publish_interaction_completed(event)

        logger.info(
            "published interaction.completed user=%s template=%s event_id=%s",
            record.user_id, record.template_id, event["event_id"]
        )

        return {
            "id": record.id,
            "user_id": record.user_id,
            "template_id": record.template_id,
            "completed_at": record.completed_at.isoformat(),
            "day_key": record.day_key,
            "published_event": event
        }

    except Exception:
        status = "500"
        logger.exception("complete_interaction failed")
        raise

    finally:
        duration = time.time() - start
        HTTP_LATENCY.labels("interaction-service", "POST", "/api/v1/interactions/complete").observe(duration)
        HTTP_REQUESTS.labels("interaction-service", "POST", "/api/v1/interactions/complete", status).inc()

@app.post("/api/v1/interactions/check-missed")
def check_missed(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    start = time.time()
    status = "200"
    try:
        user_id = current_user["user_id"]
        day_key = datetime.utcnow().strftime("%Y-%m-%d")

        # 判断今天是否至少完成过一次
        has_done = db.query(InteractionLog).filter(
            InteractionLog.user_id == user_id,
            InteractionLog.day_key == day_key
        ).first() is not None

        # ✅ 这条日志要放在分支之前，这样 has_done=True 也能记录
        logger.info("check_missed user=%s day=%s has_done=%s", user_id, day_key, has_done)

        if has_done:
            return {"user_id": user_id, "day_key": day_key, "missed": False}

        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": "interaction.missed",
            "user_id": user_id,
            "day_key": day_key,
            "hp_delta": -10,
            "mood_delta": -1
        }

        publish_interaction_missed(event)

        logger.info(
            "published interaction.missed user=%s day=%s event_id=%s",
            user_id, day_key, event["event_id"]
        )

        return {"user_id": user_id, "day_key": day_key, "missed": True, "published_event": event}

    except Exception:
        status = "500"
        logger.exception("check_missed failed")
        raise

    finally:
        duration = time.time() - start
        HTTP_LATENCY.labels("interaction-service", "POST", "/api/v1/interactions/check-missed").observe(duration)
        HTTP_REQUESTS.labels("interaction-service", "POST", "/api/v1/interactions/check-missed", status).inc()