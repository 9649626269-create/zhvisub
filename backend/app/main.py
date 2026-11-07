"""FastAPI application main entrypoint: CORS, routes, exception handlers, and startup."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.jobs import router as jobs_router
from app.api.schemas import ErrorResponse, VoiceItem
from app.config import settings
from app.db import init_db
from app.errors import AppError, ErrorCode
from app.pipeline.dub import list_voices

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("zhvisub")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize database and prepare directories."""
    settings.ensure_dirs()
    init_db()
    logger.info("ZhViSub API server started. Database and directories initialized.")
    yield
    logger.info("ZhViSub API server shutting down.")


app = FastAPI(
    title="ZhViSub API",
    description="REST API dịch video tiếng Trung sang tiếng Việt, làm mờ phụ đề cứng và lồng tiếng.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration (including Web localhost:3000 and Capacitor Android origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    """Handle application errors and return standard Vietnamese error payload."""
    status_code = status.HTTP_400_BAD_REQUEST
    if exc.code == ErrorCode.JOB_NOT_FOUND:
        status_code = status.HTTP_404_NOT_FOUND
    elif exc.code == ErrorCode.MAX_JOBS_REACHED:
        status_code = status.HTTP_429_TOO_MANY_REQUESTS
    elif exc.code in (ErrorCode.UPLOAD_TOO_LARGE, ErrorCode.STORAGE_FULL):
        status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    elif exc.code == ErrorCode.SSRF_BLOCKED:
        status_code = status.HTTP_403_FORBIDDEN

    return JSONResponse(
        status_code=status_code,
        content={"code": exc.code.value if hasattr(exc.code, "value") else str(exc.code), "message": exc.message},
    )


@app.get("/health", tags=["system"])
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "app": "ZhViSub", "version": "1.0.0"}


@app.get("/voices", response_model=list[VoiceItem], tags=["voices"])
async def get_voices():
    """Get list of available Vietnamese TTS voices."""
    voices = await list_voices()
    return voices


# Include Jobs router
app.include_router(jobs_router)
