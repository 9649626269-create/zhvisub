"""Celery application configuration with task routing and beat schedules."""

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "zhvisub",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.pipeline_tasks",
        "app.tasks.ocr_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.ocr_tasks.*": {"queue": "ocr"},
        "app.tasks.pipeline_tasks.process_video_job": {"queue": "main"},
        "app.tasks.pipeline_tasks.rerender_job": {"queue": "main"},
        "app.tasks.pipeline_tasks.cleanup_expired_jobs": {"queue": "main"},
    },
    beat_schedule={
        "cleanup-expired-jobs-every-hour": {
            "task": "app.tasks.pipeline_tasks.cleanup_expired_jobs",
            "schedule": crontab(minute=0),  # Run at minute 0 of every hour
        },
    },
)
