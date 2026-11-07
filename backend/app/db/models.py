"""SQLAlchemy models for Job, Segment, and BlurRegion."""

from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.session import Base


def utc_now():
    return datetime.now(timezone.utc)


class Job(Base):
    """Represents a video translation processing job."""
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, index=True)
    status = Column(String(20), default="pending", index=True)  # pending, processing, completed, failed, cancelled
    current_step = Column(String(30), default="")
    step_progress = Column(Float, default=0.0)
    overall_progress = Column(Float, default=0.0)
    step_log = Column(String(255), default="")

    options = Column(JSON, default=dict)
    error_code = Column(String(50), nullable=True)
    error_message = Column(Text, nullable=True)

    video_filename = Column(String(255), default="")
    video_duration = Column(Float, default=0.0)
    video_width = Column(Integer, default=0)
    video_height = Column(Integer, default=0)
    has_dub = Column(Boolean, default=False)

    celery_task_id = Column(String(64), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    segments = relationship("SegmentModel", back_populates="job", cascade="all, delete-orphan", order_by="SegmentModel.segment_index")
    blur_regions = relationship("BlurRegionModel", back_populates="job", cascade="all, delete-orphan")


class SegmentModel(Base):
    """Represents a sentence segment with timing, Chinese text, Vietnamese translation, and dubbing info."""
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(36), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_index = Column(Integer, nullable=False)

    start = Column(Float, nullable=False)
    end = Column(Float, nullable=False)
    zh = Column(Text, default="")
    vi = Column(Text, default="")

    dub_text = Column(Text, nullable=True)
    dub_speed = Column(Float, default=1.0)
    dub_status = Column(String(20), default="ok")  # ok, stretched, shortened, overflow

    job = relationship("Job", back_populates="segments")


class BlurRegionModel(Base):
    """Represents a hard subtitle region detected by OCR or customized by user."""
    __tablename__ = "blur_regions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(36), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)

    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
    w = Column(Integer, nullable=False)
    h = Column(Integer, nullable=False)
    intervals = Column(JSON, default=list)  # list of [start_sec, end_sec]

    job = relationship("Job", back_populates="blur_regions")


class UserModel(Base):
    """Represents an authenticated user (via Google OAuth) with encrypted AI keys."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), default="")
    picture = Column(String(512), nullable=True)

    # Google OAuth credentials
    google_sub = Column(String(255), unique=True, index=True, nullable=True)
    google_refresh_token_enc = Column(Text, nullable=True)

    # Custom AI API Key (AES-Fernet encrypted)
    api_provider = Column(String(50), default="gemini")  # gemini, openai, anthropic, custom
    api_key_enc = Column(Text, nullable=True)
    api_base_url = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
