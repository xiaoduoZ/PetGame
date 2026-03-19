from pydantic import BaseModel


class PetResponse(BaseModel):
    id: int
    user_id: str
    name: str
    hp: int
    xp: int
    level: int
    mood: int
    streak: int

    class Config:
        from_attributes = True