import os
import time
import logging

from fastapi import FastAPI, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import UserMap, UserFarm
from .schemas import MapSave, FarmSave
from .auth import get_current_user

from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

logger = logging.getLogger("petgame.world")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(
    title="world-service",
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
    ["service", "method", "path", "status"],
)
HTTP_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["service", "method", "path"],
)


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.on_event("startup")
def on_startup():
    # The DB container may still be coming up on a fresh `docker compose up`.
    for attempt in range(15):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except Exception:
            logger.warning("world_db not ready, retrying (%d/15)", attempt + 1)
            time.sleep(3)
    Base.metadata.create_all(bind=engine)  # last try; let it raise if still down


@app.get("/health")
def health():
    return {"service": "world-service", "status": "ok"}


@app.get("/api/v1/map/me")
def get_map(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    start = time.time()
    status = "200"
    try:
        user_id = current_user["user_id"]
        row = db.query(UserMap).filter(UserMap.user_id == user_id).first()
        logger.info("get_map user=%s found=%s", user_id, row is not None)
        return {
            "user_id": user_id,
            "data": row.data if row else None,
            "updated_at": row.updated_at.isoformat() if row else None,
        }
    except Exception:
        status = "500"
        logger.exception("get_map failed")
        raise
    finally:
        HTTP_LATENCY.labels("world-service", "GET", "/api/v1/map/me").observe(time.time() - start)
        HTTP_REQUESTS.labels("world-service", "GET", "/api/v1/map/me", status).inc()


@app.put("/api/v1/map/me")
def save_map(
    payload: MapSave,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start = time.time()
    status = "200"
    try:
        user_id = current_user["user_id"]
        row = db.query(UserMap).filter(UserMap.user_id == user_id).first()
        if row:
            row.data = payload.data
        else:
            row = UserMap(user_id=user_id, data=payload.data)
            db.add(row)
        db.commit()
        db.refresh(row)
        logger.info("save_map user=%s props=%s", user_id, len((payload.data or {}).get("props", [])))
        return {
            "user_id": user_id,
            "data": row.data,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
    except Exception:
        status = "500"
        logger.exception("save_map failed")
        raise
    finally:
        HTTP_LATENCY.labels("world-service", "PUT", "/api/v1/map/me").observe(time.time() - start)
        HTTP_REQUESTS.labels("world-service", "PUT", "/api/v1/map/me", status).inc()


@app.get("/api/v1/farm/me")
def get_farm(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = current_user["user_id"]
    row = db.query(UserFarm).filter(UserFarm.user_id == user_id).first()
    return {"user_id": user_id, "crops": (row.crops if row else []) or []}


@app.put("/api/v1/farm/me")
def save_farm(
    payload: FarmSave,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user["user_id"]
    row = db.query(UserFarm).filter(UserFarm.user_id == user_id).first()
    if row:
        row.crops = payload.crops
    else:
        row = UserFarm(user_id=user_id, crops=payload.crops)
        db.add(row)
    db.commit()
    logger.info("save_farm user=%s crops=%d", user_id, len(payload.crops or []))
    return {"user_id": user_id, "crops": payload.crops}
