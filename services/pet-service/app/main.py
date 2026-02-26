from fastapi import FastAPI

app = FastAPI(title="pet-service")

@app.get("/health")
def health():
    return {"service": "pet-service", "status": "ok"}