from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from .db import Base


class InteractionLog(Base):
    __tablename__ = "interaction_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, nullable=False, index=True)
    template_id = Column(String, nullable=False, index=True)
    completed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    day_key = Column(String, nullable=False, index=True)