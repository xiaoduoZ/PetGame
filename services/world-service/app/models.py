from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from .db import Base


class UserMap(Base):
    __tablename__ = "user_maps"

    # One saved world per user.
    user_id = Column(String, primary_key=True, index=True)
    data = Column(JSONB, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserFarm(Base):
    __tablename__ = "user_farms"

    # Planted crops per user: list of {col, row, type, plantedAt}.
    user_id = Column(String, primary_key=True, index=True)
    crops = Column(JSONB, nullable=False, default=list)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
