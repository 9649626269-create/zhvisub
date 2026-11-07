"""Jobs router implementing REST API for video translation pipeline."""

import logging
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Header,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.schemas import (
    JobCreateResponse,
    JobListResponse,
    JobStatusResponse,
    RenderRequest,
    SegmentItem,
    SegmentUpdateList,
)
from app.api.streaming import range_streaming_response
from app.celery_app import celery_app
from app.config import settings
from app.db import Job, SegmentModel, get_db
from app.errors import AppError, ErrorCode
from app.pipeline.audio import extract_frame, probe_video
from app.pipeline.ingest import download_video, save_upload_stream
from app.pipeline.render import kill_all_active_renders
from app.storage import storage
from app.tasks.pipeline_tasks import process_video_job, rerender_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobCreateResponse, status_code=status.HTTP_201_CREATED)
def create_job(
    file: Optional[UploadFile] = File(None),
    url: Optional[str] = Form(None),
    blur: bool = Form(True),
    blur_strength: int = Form(30),
    font_size: int = Form(0),
    color: str = Form("&H00FFFFFF"),
    position: str = Form("bottom"),
    font: str = Form("Noto Sans"),
    dub: bool = Form(False),
    voice: str = Form(settings.tts_voice),
    dub_rate: str = Form("+0%"),
    orig_audio: str = Form("duck"),
    db: Session = Depends(get_db),
):
    """
    Create a new video translation job via file upload stream or URL download.
    """
    if not file and not url:
        raise AppError(ErrorCode.INVALID_VIDEO, "Cần cung cấp file video hoặc đường link URL.")

    # 1. Check max concurrent active jobs
    active_jobs_count = (
        db.query(Job)
        .filter(Job.status.in_(["pending", "processing"]))
        .count()
    )
    if active_jobs_count >= settings.max_concurrent_jobs:
        raise AppError(
            ErrorCode.MAX_JOBS_REACHED,
            f"Đã đạt giới hạn tối đa {settings.max_concurrent_jobs} công việc đồng thời. Vui lòng thử lại sau.",
        )

    # 2. Check total storage capacity
    max_storage_bytes = int(settings.max_upload_gb * 5 * 1024 * 1024 * 1024)
    if storage.total_usage_bytes() > max_storage_bytes:
        raise AppError(ErrorCode.STORAGE_FULL, "Dung lượng bộ nhớ máy chủ đã đầy.")

    # 3. Create Job Directory
    job_id = str(uuid.uuid4())
    job_dir = settings.get_job_dir(job_id)

    options_dict = {
        "blur": blur,
        "blur_strength": blur_strength,
        "font_size": font_size,
        "color": color,
        "position": position,
        "font": font,
        "dub": dub,
        "voice": voice,
        "dub_rate": dub_rate,
        "orig_audio": orig_audio,
    }

    original_filename = ""
    try:
        if file:
            original_filename = file.filename or "uploaded_video.mp4"
            target_path = job_dir / f"input_video{Path(original_filename).suffix.lower()}"
            save_upload_stream(file.file, original_filename, target_path)
        else:
            original_filename = Path(url.split("?")[0]).name or "downloaded_video.mp4"
            target_path = job_dir / "input_video.mp4"
            download_video(url, target_path)

        # Probe video
        meta = probe_video(target_path)
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        if isinstance(exc, AppError):
            raise exc
        raise AppError(ErrorCode.INVALID_VIDEO, f"Lỗi tiếp nhận video: {exc}")

    # 4. Insert Job into DB
    job_record = Job(
        id=job_id,
        status="pending",
        current_step="ingest",
        step_progress=1.0,
        overall_progress=0.05,
        step_log="Đã tiếp nhận video, sẵn sàng xử lý.",
        options=options_dict,
        video_filename=original_filename,
        video_duration=meta["duration"],
        video_width=meta["width"],
        video_height=meta["height"],
        has_dub=dub,
    )
    db.add(job_record)
    db.commit()

    # 5. Enqueue background task
    try:
        task = process_video_job.delay(job_id)
        job_record.celery_task_id = task.id
        db.commit()
    except Exception as exc:
        logger.warning("Không thể gửi Celery task qua Redis (%s), chạy trực tiếp...", exc)
        # Fallback to direct synchronous execution in dev/test environment
        import threading
        t = threading.Thread(target=process_video_job, args=(job_id,), daemon=True)
        t.start()

    return JobCreateResponse(
        id=job_id,
        status="pending",
        message="Đã tiếp nhận video, bắt đầu xử lý pipeline.",
    )


@router.get("", response_model=JobListResponse)
def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get paginated list of video translation jobs sorted newest first."""
    query = db.query(Job).order_by(Job.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return JobListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=items,
    )


@router.get("/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    """Get status, progress, logs, and metadata for a specific job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND, f"Không tìm thấy job với ID: {job_id}")
    return job


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str, db: Session = Depends(get_db)):
    """Cancel an active processing job and terminate its FFmpeg process."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    job.status = "cancelled"
    job.step_log = "Công việc đã bị người dùng huỷ."
    db.commit()

    # Revoke Celery task
    if job.celery_task_id:
        try:
            celery_app.control.revoke(job.celery_task_id, terminate=True, signal="SIGKILL")
        except Exception:
            pass

    # Kill running FFmpeg process
    kill_all_active_renders()

    return {"message": "Đã gửi yêu cầu huỷ công việc thành công."}


@router.delete("/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db)):
    """Delete job record and its files from storage."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    # Cancel if still active
    if job.status in ("pending", "processing"):
        job.status = "cancelled"
        db.commit()
        if job.celery_task_id:
            try:
                celery_app.control.revoke(job.celery_task_id, terminate=True)
            except Exception:
                pass
        kill_all_active_renders()

    # Delete files
    job_dir = settings.data_dir / "jobs" / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)

    db.delete(job)
    db.commit()
    return {"message": f"Đã xoá hoàn toàn công việc {job_id} và các file liên quan."}


@router.get("/{job_id}/segments")
def get_job_segments(job_id: str, db: Session = Depends(get_db)):
    """Get all subtitle segments for this job."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    segments = (
        db.query(SegmentModel)
        .filter(SegmentModel.job_id == job_id)
        .order_by(SegmentModel.segment_index)
        .all()
    )
    return [
        {
            "id": s.segment_index,
            "start": s.start,
            "end": s.end,
            "zh": s.zh,
            "vi": s.vi,
            "dub_text": s.dub_text,
            "dub_speed": s.dub_speed,
            "dub_status": s.dub_status,
        }
        for s in segments
    ]


@router.put("/{job_id}/segments")
def update_job_segments(job_id: str, body: SegmentUpdateList, db: Session = Depends(get_db)):
    """Update subtitle segments (Vietnamese translation and dubbing text)."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    seg_map = {item.id: item for item in body.segments}
    db_segments = db.query(SegmentModel).filter(SegmentModel.job_id == job_id).all()

    for s in db_segments:
        if s.segment_index in seg_map:
            update_item = seg_map[s.segment_index]
            s.zh = update_item.zh
            s.vi = update_item.vi
            s.dub_text = update_item.dub_text
            s.dub_speed = update_item.dub_speed
            s.dub_status = update_item.dub_status

    db.commit()
    return {"message": f"Đã cập nhật {len(body.segments)} câu phụ đề thành công."}


@router.post("/{job_id}/render")
def trigger_rerender(job_id: str, body: RenderRequest, db: Session = Depends(get_db)):
    """
    Re-render video with modified options or manual blur regions.
    Re-uses ASR and OCR results; only re-executes TTS and final render.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    new_options = {k: v for k, v in body.model_dump().items() if v is not None and k != "blur_regions"}
    manual_regions = [r.model_dump() for r in body.blur_regions] if body.blur_regions is not None else None

    try:
        rerender_job.delay(job_id, new_options, manual_regions)
    except Exception:
        # Fallback to direct thread
        import threading
        t = threading.Thread(target=rerender_job, args=(job_id, new_options, manual_regions), daemon=True)
        t.start()

    return {"id": job_id, "status": "processing", "message": "Đang tiến hành render lại video."}


@router.get("/{job_id}/download")
def download_artifact(
    job_id: str,
    type: str = Query(..., pattern="^(mp4|srt_vi|srt_zh|dub)$"),
    db: Session = Depends(get_db),
):
    """Download generated artifacts: mp4, vi.srt, zh.srt, dub.wav."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    job_dir = settings.get_job_dir(job_id)
    file_map = {
        "mp4": (job_dir / "output.mp4", "video.mp4", "video/mp4"),
        "srt_vi": (job_dir / "vi.srt", "subtitles_vi.srt", "text/plain; charset=utf-8"),
        "srt_zh": (job_dir / "zh.srt", "subtitles_zh.srt", "text/plain; charset=utf-8"),
        "dub": (job_dir / "dub.wav", "dubbing.wav", "audio/wav"),
    }

    target_file, download_name, media_type = file_map[type]
    if not target_file.exists():
        raise AppError(
            ErrorCode.RENDER_ERROR,
            f"File yêu cầu ({type}) chưa được tạo hoặc chưa hoàn tất render.",
        )

    return FileResponse(
        path=target_file,
        filename=download_name,
        media_type=media_type,
    )


@router.get("/{job_id}/video")
@router.head("/{job_id}/video")
def get_original_video(
    job_id: str,
    range: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Stream the original input video with HTTP 206 Range support for preview and scrubbing."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    job_dir = settings.get_job_dir(job_id)
    input_videos = list(job_dir.glob("input_video*"))
    if not input_videos:
        raise AppError(ErrorCode.INVALID_VIDEO, "Không tìm thấy file video gốc.")

    return range_streaming_response(input_videos[0], range_header=range)


@router.get("/{job_id}/frame")
def get_frame(
    job_id: str,
    t: float = Query(0.0, ge=0.0),
    db: Session = Depends(get_db),
):
    """Extract and return a single JPEG frame at timestamp t for manual blur drawing."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise AppError(ErrorCode.JOB_NOT_FOUND)

    job_dir = settings.get_job_dir(job_id)
    input_videos = list(job_dir.glob("input_video*"))
    if not input_videos:
        raise AppError(ErrorCode.INVALID_VIDEO, "Không tìm thấy video.")

    frame_path = job_dir / f"frame_{t:.2f}.jpg"
    if not frame_path.exists():
        extract_frame(input_videos[0], time_sec=t, output_path=frame_path)

    return FileResponse(frame_path, media_type="image/jpeg")
