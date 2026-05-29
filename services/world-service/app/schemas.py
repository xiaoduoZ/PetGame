from pydantic import BaseModel
from typing import Any, Optional


class MapSave(BaseModel):
    # The full map definition: { cols, rows, grid, props, pets }
    data: dict


class FarmSave(BaseModel):
    # List of planted crops: [{ col, row, type, plantedAt }]
    crops: list


class MapResponse(BaseModel):
    user_id: str
    data: Optional[Any] = None
    updated_at: Optional[str] = None
