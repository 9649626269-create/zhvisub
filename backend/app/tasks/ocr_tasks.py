"""Celery task for OCR detection routed to the isolated 'ocr' queue."""

import logging
from pathlib import Path

from app.celery_app import celery_app
from app.pipeline.ocr import detect_hardsubs

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.ocr_tasks.detect_hardsubs_task")
def detect_hardsubs_task(video_path_str: str, video_width: int, video_height: int) -> dict:
    """Run OCR detection on video to detect hard subtitles."""
    video_path = Path(video_path_str)
    logger.info("Executing OCR detection task for: %s", video_path)

    result = detect_hardsubs(
        video_path=video_path,
        video_width=video_width,
        video_height=video_height,
    )

    regions_data = [
        {
            "x": r.bbox.x,
            "y": r.bbox.y,
            "w": r.bbox.w,
            "h": r.bbox.h,
            "intervals": r.intervals,
        }
        for r in result.regions
    ]

    return {
        "has_hardsub": result.has_hardsub,
        "regions": regions_data,
    }
