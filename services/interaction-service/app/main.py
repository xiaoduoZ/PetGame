from fastapi import FastAPI

app = FastAPI(title="interaction-service")

@app.get("/health")
def health():
    return {"service": "interaction-service", "status": "ok"}