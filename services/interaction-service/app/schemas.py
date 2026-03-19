from pydantic import BaseModel


class InteractionCompleteRequest(BaseModel):
    template_id: str


class InteractionCompleteResponse(BaseModel):
    id: int
    user_id: str
    template_id: str
    completed_at: str
    day_key: str