"""Celery tasks for video processing pipeline, re-rendering, and periodic cleanup."""

import logging
import os
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from app.celery_app import celery_app
from app.config import settings
from app.db.models import BlurRegionModel, Job, SegmentModel
from app.db.session import SessionLocal
from app.errors import AppError, ErrorCode
from app.pipeline.audio import probe_video
from app.pipeline.dub import generate_dub
from app.pipeline.ocr import BBox, BlurRegion
from app.pipeline.pipeline import PipelineOptions, run_pipeline
from app.pipeline.render import kill_all_active_renders, render_final_video
from app.pipeline.subtitle import generate_ass, generate_srt

logger = logging.getLogger(__name__)


def cleanup_temp_files(job_dir: Path):
    """Clean up intermediate files (16kHz WAV, frames, temp scripts) after processing."""
    try:
        (job_dir / "audio_16k.wav").unlink(missing_ok=True)
        (job_dir / "render_filtergraph.txt").unlink(missing_ok=True)
        # Clean temporary frames directory if present
        for f in job_dir.glob("frame_*.jpg"):
            f.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("Không thể xoá một số file tạm tại %s: %s", job_dir, exc)


@celery_app.task(name="app.tasks.pipeline_tasks.process_video_job", bind=True, queue="main")
def process_video_job(self, job_id: str):
    """Main background task processing the entire video pipeline."""
    db = SessionLocal()
    job_dir = settings.get_job_dir(job_id)

    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            logger.error("Job %s không tồn tại trong database", job_id)
            return

        if job.status == "cancelled":
            logger.info("Job %s đã bị huỷ trước khi bắt đầu", job_id)
            return

        job.status = "processing"
        job.celery_task_id = self.request.id
        db.commit()

        # Build pipeline options from job options
        opts_dict = job.options or {}
        options = PipelineOptions(
            blur=opts_dict.get("blur", True),
            blur_strength=opts_dict.get("blur_strength", 30),
            font_size=opts_dict.get("font_size", 0),
            font_name=opts_dict.get("font", "Noto Sans"),
            color=opts_dict.get("color", "&H00FFFFFF"),
            position=opts_dict.get("position", "bottom"),
            dub=opts_dict.get("dub", False),
            voice=opts_dict.get("voice", settings.tts_voice),
            dub_rate=opts_dict.get("dub_rate", "+0%"),
            orig_audio=opts_dict.get("orig_audio", "duck"),
            translate_engine=opts_dict.get("translate_engine", "gemini"),
            api_key=opts_dict.get("api_key", None),
            api_base_url=opts_dict.get("api_base_url", None),
            llm_model=opts_dict.get("llm_model", None),
        )

        def is_cancelled() -> bool:
            curr_job = db.query(Job).filter(Job.id == job_id).first()
            return curr_job is not None and curr_job.status == "cancelled"

        def progress_callback(step: str, fraction: float, message: str):
            curr_job = db.query(Job).filter(Job.id == job_id).first()
            if curr_job and curr_job.status != "cancelled":
                curr_job.current_step = step
                curr_job.overall_progress = round(fraction, 3)
                curr_job.step_log = message
                db.commit()

        # Find input video in job directory
        input_videos = list(job_dir.glob("input_video*"))
        if not input_videos:
            raise AppError(ErrorCode.INVALID_VIDEO, "Không tìm thấy file video đầu vào trong thư mục job.")
        video_path = input_videos[0]

        # Execute pipeline
        result = run_pipeline(
            video_source=video_path,
            output_dir=job_dir,
            options=options,
            progress_callback=progress_callback,
            cancel_check=is_cancelled,
        )

        # Refresh job record and save metadata
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or job.status == "cancelled":
            cleanup_temp_files(job_dir)
            return

        meta = probe_video(result.output_mp4)
        job.video_duration = meta["duration"]
        job.video_width = meta["width"]
        job.video_height = meta["height"]
        job.has_dub = options.dub

        # Save segments to DB
        db.query(SegmentModel).filter(SegmentModel.job_id == job_id).delete()
        for s in result.segments:
            seg_record = SegmentModel(
                job_id=job_id,
                segment_index=s["id"],
                start=s["start"],
                end=s["end"],
                zh=s.get("zh", ""),
                vi=s.get("vi", ""),
                dub_text=s.get("dub_text"),
                dub_speed=s.get("dub_speed", 1.0),
                dub_status=s.get("dub_status", "ok"),
            )
            db.add(seg_record)

        # Save blur regions to DB
        db.query(BlurRegionModel).filter(BlurRegionModel.job_id == job_id).delete()
        for r in result.blur_regions:
            bbox = r["bbox"]
            reg_record = BlurRegionModel(
                job_id=job_id,
                x=bbox["x"],
                y=bbox["y"],
                w=bbox["w"],
                h=bbox["h"],
                intervals=r.get("intervals", []),
            )
            db.add(reg_record)

        job.status = "completed"
        job.current_step = "done"
        job.overall_progress = 1.0
        job.step_log = "Hoàn thành xử lý video."
        db.commit()

    except AppError as e:
        logger.error("Lỗi AppError khi xử lý job %s: %s", job_id, e.message)
        job = db.query(Job).filter(Job.id == job_id).first()
        if job and job.status != "cancelled":
            job.status = "failed"
            job.error_code = e.code.value if hasattr(e.code, "value") else str(e.code)
            job.error_message = e.message
            job.step_log = f"Lỗi: {e.message}"
            db.commit()

    except Exception as e:
        logger.exception("Lỗi không xác định khi xử lý job %s: %s", job_id, e)
        job = db.query(Job).filter(Job.id == job_id).first()
        if job and job.status != "cancelled":
            job.status = "failed"
            job.error_code = ErrorCode.RENDER_ERROR.value
            job.error_message = str(e)
            job.step_log = f"Lỗi hệ thống: {e}"
            db.commit()

    finally:
        cleanup_temp_files(job_dir)
        db.close()


@celery_app.task(name="app.tasks.pipeline_tasks.rerender_job", bind=True, queue="main")
def rerender_job(self, job_id: str, new_options: dict, manual_blur_regions: Optional[list] = None):
    """
    Re-render video reusing existing ASR and translation results.
    Only re-runs Step 6 (TTS dubbing for modified segments) and Step 7 (final render).
    """
    db = SessionLocal()
    job_dir = settings.get_job_dir(job_id)

    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        job.status = "processing"
        job.current_step = "render"
        job.step_log = "Bắt đầu render lại video..."
        job.overall_progress = 0.5
        db.commit()

        # Update job options
        curr_options = job.options or {}
        curr_options.update(new_options)
        job.options = curr_options

        # Load segments from DB
        segments = db.query(SegmentModel).filter(SegmentModel.job_id == job_id).order_by(SegmentModel.segment_index).all()
        seg_dicts = [
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

        # Locate input video
        input_videos = list(job_dir.glob("input_video*"))
        if not input_videos:
            raise AppError(ErrorCode.INVALID_VIDEO, "Không tìm thấy video gốc để render lại.")
        video_path = input_videos[0]

        meta = probe_video(video_path)
        width = meta["width"]
        height = meta["height"]
        duration = meta["duration"]

        # 1. Regenerate subtitles (.srt and .ass)
        srt_vi_path = job_dir / "vi.srt"
        ass_path = job_dir / "subtitles.ass"
        generate_srt(seg_dicts, srt_vi_path, text_key="vi")

        fonts_dir = Path(__file__).resolve().parent.parent / "fonts"
        generate_ass(
            segments=seg_dicts,
            output_path=ass_path,
            video_width=width,
            video_height=height,
            font_name=curr_options.get("font", "Noto Sans"),
            font_size=curr_options.get("font_size", 0),
            primary_color=curr_options.get("color", "&H00FFFFFF"),
            position=curr_options.get("position", "bottom"),
        )

        # 2. Dubbing (if dub=True)
        dub_wav_path: Optional[Path] = None
        if curr_options.get("dub", False):
            job.current_step = "dub"
            job.step_log = "Đang tạo giọng đọc mới..."
            db.commit()

            dub_wav_path, clips = generate_dub(
                segments=seg_dicts,
                video_duration=duration,
                job_dir=job_dir,
                voice=curr_options.get("voice", settings.tts_voice),
                dub_rate=curr_options.get("dub_rate", "+0%"),
            )
            # Update segments in DB
            clip_map = {c.segment_id: c for c in clips}
            for s in segments:
                if s.segment_index in clip_map:
                    c = clip_map[s.segment_index]
                    s.dub_speed = c.speed_factor
                    s.dub_status = c.status
                    s.dub_text = c.text
            db.commit()

        # 3. Determine blur regions
        blur_regions: list[BlurRegion] = []
        if curr_options.get("blur", True):
            if manual_blur_regions is not None:
                # Custom regions passed from request
                for cr in manual_blur_regions:
                    px = int(cr["x"] * width)
                    py = int(cr["y"] * height)
                    pw = int(cr["w"] * width)
                    ph = int(cr["h"] * height)
                    blur_regions.append(BlurRegion(
                        bbox=BBox(x=px, y=py, w=pw, h=ph),
                        intervals=[(0.0, duration)],
                    ))
            else:
                # Use stored OCR regions from DB
                db_regions = db.query(BlurRegionModel).filter(BlurRegionModel.job_id == job_id).all()
                for dr in db_regions:
                    blur_regions.append(BlurRegion(
                        bbox=BBox(x=dr.x, y=dr.y, w=dr.w, h=dr.h),
                        intervals=[tuple(iv) for iv in (dr.intervals or [])],
                    ))

        # 4. Render final video
        job.current_step = "render"
        job.step_log = "Đang render video..."
        db.commit()

        output_mp4 = job_dir / "output.mp4"
        render_final_video(
            video_path=video_path,
            output_path=output_mp4,
            ass_path=ass_path,
            blur_regions=blur_regions if curr_options.get("blur", True) else None,
            dub_wav_path=dub_wav_path,
            orig_audio=curr_options.get("orig_audio", "duck"),
            video_width=width,
            video_height=height,
            duration=duration,
            blur_strength=curr_options.get("blur_strength", 30),
            fonts_dir=fonts_dir if fonts_dir.exists() else None,
        )

        job.status = "completed"
        job.current_step = "done"
        job.overall_progress = 1.0
        job.step_log = "Render lại video thành công."
        db.commit()

    except Exception as e:
        logger.exception("Lỗi re-render job %s: %s", job_id, e)
        job = db.query(Job).filter(Job.id == job_id).first()
        if job:
            job.status = "failed"
            job.error_code = ErrorCode.RENDER_ERROR.value
            job.error_message = f"Render lại thất bại: {e}"
            db.commit()

    finally:
        cleanup_temp_files(job_dir)
        db.close()


@celery_app.task(name="app.tasks.pipeline_tasks.cleanup_expired_jobs", queue="main")
def cleanup_expired_jobs():
    """Periodic Celery beat task to purge jobs and files older than RETENTION_HOURS."""
    db = SessionLocal()
    retention_cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.retention_hours)
    logger.info("Executing retention cleanup for jobs older than: %s", retention_cutoff)

    try:
        expired_jobs = db.query(Job).filter(Job.created_at < retention_cutoff).all()
        for job in expired_jobs:
            job_dir = settings.data_dir / "jobs" / job.id
            if job_dir.exists():
                shutil.rmtree(job_dir, ignore_errors=True)
                logger.info("Đã xoá thư mục file của job hết hạn: %s", job.id)
            db.delete(job)

        db.commit()
        logger.info("Hoàn tất dọn dẹp: Đã xoá %d job quá hạn.", len(expired_jobs))
    except Exception as exc:
        logger.error("Lỗi trong quá trình dọn dẹp job hết hạn: %s", exc)
        db.rollback()
    finally:
        db.close()
