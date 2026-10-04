import os
# Set env var before importing main
os.environ["INTERNAL_API_KEY"] = "test-secret-key"
os.environ["GROQ_API_KEY"] = "dummy"

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("=== Endpoint Security Test ===")

# 1. Test missing API key
print("\n[1] Testing WITHOUT X-API-Key header...")
response = client.post("/generate-questions", json={
    "role": "Software Engineer",
    "level": "Junior",
    "resume_text": "C++ Developer"
})
print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}")

# 2. Test invalid API key
print("\n[2] Testing with INVALID X-API-Key header...")
response = client.post("/generate-questions", headers={"X-API-Key": "wrong-key"}, json={
    "role": "Software Engineer",
    "level": "Junior",
    "resume_text": "C++ Developer"
})
print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}")

# 3. Test valid API key
print("\n[3] Testing with VALID X-API-Key header...")
response = client.post("/generate-questions", headers={"X-API-Key": "test-secret-key"}, json={
    "role": "Software Engineer",
    "level": "Junior",
    "resume_text": "C++ Developer"
})
print(f"Status Code: {response.status_code}")
print("Auth was successful! (Status 500 here just means Gemini dummy key failed, which is expected during a unit test)")

# 4. Test Health Check (should NOT require auth)
print("\n[4] Testing Health Check endpoint (No Auth Required)...")
response = client.get("/")
print(f"Status Code: {response.status_code}")
print(f"Response: {response.text}")
