"""
TechVera AI Microservice - Entry Point
Main entry for the modular AI service using FastAPI.

ARCHITECTURE OVERVIEW:
This is the isolated Python Microservice dedicated exclusively to running heavy ML and AI workloads.
1. It is deliberately detached from the Node.js backend so that AI-heavy calls (Groq LLM + Whisper)
   don't block the Node event loop.
2. It handles audio transcription (Groq Whisper), resume parsing (PyMuPDF), and intelligent NLP scoring (Groq LLM).
3. The server lazily loads models during the `lifespan` event to conserve RAM during cold boots.
"""

import os
import secrets
import sys
import uvicorn
from fastapi import FastAPI, Depends, HTTPException, Security
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from app.api.interview import router as interview_router
from app.api.v2.resume import router as v2_resume_router

load_dotenv()

# Startup validation for critical environment variables
if not os.getenv("GROQ_API_KEY"):
    print("WARNING: GROQ_API_KEY is not set. ML endpoints may fail.", file=sys.stderr)
else:
    from app.services.groq_service import _get_api_keys
    print(f"[GROQ] {len(_get_api_keys())} API key(s) loaded for rotation "
          "(note: keys from the SAME account share one quota)")

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    expected_api_key = os.getenv("INTERNAL_API_KEY")
    if not expected_api_key:
        # In development, you might want to bypass this, but for security we enforce it.
        raise HTTPException(status_code=500, detail="INTERNAL_API_KEY not configured on server")
    if not api_key or not secrets.compare_digest(api_key.encode(), expected_api_key.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    return api_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan manager to handle startup and shutdown logic.
    Note: Heavy ML models are now lazy-loaded in whisper_service to save system RAM on cloud platforms.
    """
    yield
    # Cleanup logic (if any) can go here


def create_app() -> FastAPI:
    """
    Initialize and configure the FastAPI application instance.
    @returns: FastAPI application object.
    """
    app = FastAPI(
        title="TechVera AI Microservice",
        description="Refactored microservice for generating and evaluating interview questions.",
        version="2.0.0",
        lifespan=lifespan,
    )

    # Configure CORS: Restricted to specific production origins or internal network
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5000,http://localhost:5173")
    allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include Routers: Modular API endpoints for generation and evaluation
    # We apply the API key dependency to these routers so they are protected
    from app.api.speech import router as speech_router

    app.include_router(interview_router, tags=["Interview"], dependencies=[Depends(verify_api_key)])
    app.include_router(v2_resume_router, dependencies=[Depends(verify_api_key)])
    app.include_router(speech_router, prefix="/speech", tags=["Speech"], dependencies=[Depends(verify_api_key)])

    @app.get("/", tags=["Health"])
    async def root():
        """Basic health check endpoint."""
        return {"message": "TechVera AI Microservice is running (Modular Version)"}

    @app.get("/health", tags=["Health"])
    async def health():
        """Health check endpoint for Render/uptime monitoring."""
        return {"status": "ok"}

    return app


app = create_app()

if __name__ == "__main__":
    # Host configuration for deployment
    port = int(os.getenv("PORT", 8000))
    # Only enable reload in development; it doubles RAM usage and causes 502 on Render
    is_dev = os.getenv("NODE_ENV", "production") == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=is_dev)