"""Pydantic schemas for REST API request/response models."""

from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    """Standardized error response format."""
    code: str
    message: str


class JobCreateResponse(BaseModel):
    """Response returned upon submitting a job."""
    id: str
    status: str
    message: str = "Đã tiếp nhận video, đang chuẩn bị xử lý."


class JobStatusResponse(BaseModel):
    """Full job status, progress, and metadata."""
    id: str
    status: str
    current_step: str = ""
    step_progress: float = 0.0
    overall_progress: float = 0.0
    step_log: str = ""
    options: dict = Field(default_factory=dict)
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    video_filename: str = ""
    video_duration: float = 0.0
    video_width: int = 0
    video_height: int = 0
    has_dub: bool = False

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class JobListResponse(BaseModel):
    """Paginated list of jobs."""
    total: int
    page: int
    page_size: int
    items: List[JobStatusResponse]


class SegmentItem(BaseModel):
    """A single segment for editing or viewing."""
    id: int
    start: float
    end: float
    zh: str = ""
    vi: str = ""
    dub_text: Optional[str] = None
    dub_speed: float = 1.0
    dub_status: str = "ok"  # ok, stretched, shortened, overflow


class SegmentUpdateList(BaseModel):
    """Batch update for segments."""
    segments: List[SegmentItem]


class BlurRegionItem(BaseModel):
    """Normalized manual blur bounding box [0.0 - 1.0]."""
    x: float
    y: float
    w: float
    h: float


class RenderRequest(BaseModel):
    """Options for re-rendering video."""
    blur: Optional[bool] = None
    blur_strength: Optional[int] = None
    font_size: Optional[int] = None
    font: Optional[str] = None
    color: Optional[str] = None
    position: Optional[str] = None

    dub: Optional[bool] = None
    voice: Optional[str] = None
    dub_rate: Optional[str] = None
    orig_audio: Optional[str] = None

    # Manual blur regions in normalized coordinates (0.0 to 1.0)
    blur_regions: Optional[List[BlurRegionItem]] = None


class VoiceItem(BaseModel):
    """TTS Voice metadata."""
    name: str
    gender: str
    locale: str
