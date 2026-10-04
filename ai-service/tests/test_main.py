from fastapi.testclient import TestClient
from app.api.interview import router
from fastapi import FastAPI

app = FastAPI()
app.include_router(router, prefix="/api/v1/interview", tags=["Interview"])

@app.get("/")
def health_check():
    return {"status": "healthy"}

client = TestClient(app)

def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
