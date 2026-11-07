"""Unified pipeline orchestrator coordinating Ingest -> ASR -> OCR -> Translate -> Dub -> Render."""

import logging
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Optional

from app.config import settings
from app.errors import AppError, ErrorCode
from app.pipeline.audio import extract_audio, probe_video
from app.pipeline.asr import Segment, transcribe
from app.pipeline.dub import generate_dub
from app.pipeline.ingest import download_video
from app.pipeline.ocr import BlurRegion, detect_hardsubs
from app.pipeline.progress import ProgressTracker, StepWeight
from app.pipeline.render import render_final_video
from app.pipeline.subtitle import generate_ass, generate_srt
from app.pipeline.translate import translate_segments

logger = logging.getLogger(__name__)


@dataclass
class PipelineOptions:
    """Options for running the video translation pipeline."""
    # Subtitle & Blur options
    blur: bool = True
    blur_strength: int = 30
    font_size: int = 0
    font_name: str = "Noto Sans"
    color: str = "&H00FFFFFF"
    outline_color: str = "&H00000000"
    back_color: str = "&H80000000"
    position: str = "bottom"

    # Dubbing options
    dub: bool = False
    voice: Optional[str] = None
    dub_rate: str = "+0%"
    orig_audio: str = "duck"  # "duck" | "mute" | "keep"

    # Custom manual blur regions (optional override from frontend)
    custom_blur_regions: Optional[list[dict]] = None


@dataclass
class PipelineResult:
    """Output artifacts and metadata from pipeline run."""
    video_path: Path
    output_mp4: Path
    srt_vi_path: Path
    srt_zh_path: Path
    dub_wav_path: Optional[Path]
    segments: list[dict]
    blur_regions: list[dict]


def run_pipeline(
    video_source: str | Path,
    output_dir: Path,
    options: Optional[PipelineOptions] = None,
    progress_callback: Optional[Callable[[str, float, str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> PipelineResult:
    """
    Run end-to-end ZhViSub processing pipeline.

    Args:
        video_source: Local Path or HTTP/HTTPS URL string.
        output_dir: Target directory for job outputs.
        options: Configuration options.
        progress_callback: Called with (step_name, total_progress 0-1, message).
        cancel_check: Function returning True if execution should abort.

    Returns:
        PipelineResult with paths to generated files.
    """
    if options is None:
        options = PipelineOptions()

    output_dir.mkdir(parents=True, exist_ok=True)

    # Configure step weights based on dub option
    base_weights = StepWeight()
    if not options.dub:
        weights = base_weights.without_dub()
    else:
        weights = base_weights

    tracker = ProgressTracker(callback=progress_callback, weights=weights)

    # ----------------------------------------------------
    # Step 1: Ingest Video
    # ----------------------------------------------------
    tracker.start_step("ingest", "Bắt đầu nhận video")
    if cancel_check and cancel_check():
        raise AppError(ErrorCode.JOB_CANCELLED)

    video_source_str = str(video_source)
    if video_source_str.startswith("http://") or video_source_str.startswith("https://"):
        local_video = output_dir / "input_video.mp4"
        tracker.update(0.3, "Đang tải video từ link...")
        download_video(video_source_str, local_video)
    else:
        src_path = Path(video_source_str)
        if not src_path.exists():
            raise AppError(ErrorCode.INVALID_VIDEO, f"File video nguồn không tồn tại: {src_path}")
        local_video = output_dir / f"input_video{src_path.suffix}"
        if src_path.resolve() != local_video.resolve():
            shutil.copy2(src_path, local_video)

    # Probe video metadata
    tracker.update(0.7, "Kiểm tra định dạng video...")
    video_meta = probe_video(local_video)
    duration = video_meta["duration"]
    width = video_meta["width"]
    height = video_meta["height"]
    has_audio = video_meta["has_audio"]

    if not has_audio:
        raise AppError(ErrorCode.NO_SPEECH, "Video không có luồng âm thanh.")

    tracker.update(1.0, f"Video {width}x{height}, thời lượng {duration:.1f}s")

    # ----------------------------------------------------
    # Step 2: Extract Audio
    # ----------------------------------------------------
    if cancel_check and cancel_check():
        raise AppError(ErrorCode.JOB_CANCELLED)

    audio_wav = output_dir / "audio_16k.wav"
    extract_audio(local_video, audio_wav)

    # ----------------------------------------------------
    # Step 3: ASR (Automatic Speech Recognition)
    # ----------------------------------------------------
    tracker.start_step("asr", "Đang nhận diện giọng nói tiếng Trung...")
    if cancel_check and cancel_check():
        raise AppError(ErrorCode.JOB_CANCELLED)

    def _asr_prog(frac: float, msg: str):
        tracker.update(frac, msg)

    raw_segments = transcribe(
        audio_wav,
        progress_callback=_asr_prog,
        cancel_check=cancel_check,
    )

    if not raw_segments:
        raise AppError(ErrorCode.NO_SPEECH)

    segments_data = [
        {"id": seg.id, "start": seg.start, "end": seg.end, "zh": seg.text}
        for seg in raw_segments
    ]
    tracker.update(1.0, f"Đã nhận diện {len(segments_data)} câu")

    # ----------------------------------------------------
    # Step 4: OCR Hard-sub detection
    # ----------------------------------------------------
    blur_regions: list[BlurRegion] = []
    if options.blur:
        tracker.start_step("ocr", "Đang quét phụ đề cứng trên video...")
        if cancel_check and cancel_check():
            raise AppError(ErrorCode.JOB_CANCELLED)

        if options.custom_blur_regions is not None:
            # User supplied custom normalized regions [{x, y, w, h}]
            for cr in options.custom_blur_regions:
                from app.pipeline.ocr import BBox
                px = int(cr["x"] * width)
                py = int(cr["y"] * height)
                pw = int(cr["w"] * width)
                ph = int(cr["h"] * height)
                blur_regions.append(BlurRegion(
                    bbox=BBox(x=px, y=py, w=pw, h=ph),
                    intervals=[(0.0, duration)],  # apply whole video if no timestamps
                ))
            tracker.update(1.0, f"Áp dụng {len(blur_regions)} vùng mờ thủ công")
        else:
            def _ocr_prog(frac: float, msg: str):
                tracker.update(frac, msg)

            ocr_result = detect_hardsubs(
                local_video,
                video_width=width,
                video_height=height,
                progress_callback=_ocr_prog,
                cancel_check=cancel_check,
            )
            blur_regions = ocr_result.regions
            tracker.update(1.0, f"Phát hiện {len(blur_regions)} vùng phụ đề cứng")
    else:
        logger.info("Làm mờ phụ đề cứng đã tắt theo tuỳ chọn.")

    # ----------------------------------------------------
    # Step 5: Translate zh -> vi
    # ----------------------------------------------------
    tracker.start_step("translate", "Đang dịch sang tiếng Việt...")
    if cancel_check and cancel_check():
        raise AppError(ErrorCode.JOB_CANCELLED)

    def _tr_prog(frac: float, msg: str):
        tracker.update(frac, msg)

    translated_segments = translate_segments(
        segments_data,
        progress_callback=_tr_prog,
        cancel_check=cancel_check,
    )
    tracker.update(1.0, f"Đã dịch xong {len(translated_segments)} câu")

    # ----------------------------------------------------
    # Step 6: Generate Subtitles (.srt and .ass)
    # ----------------------------------------------------
    srt_zh_path = output_dir / "zh.srt"
    srt_vi_path = output_dir / "vi.srt"
    ass_path = output_dir / "subtitles.ass"

    generate_srt(translated_segments, srt_zh_path, text_key="zh")
    generate_srt(translated_segments, srt_vi_path, text_key="vi")

    fonts_dir = Path(__file__).resolve().parent.parent / "fonts"

    generate_ass(
        segments=translated_segments,
        output_path=ass_path,
        video_width=width,
        video_height=height,
        font_name=options.font_name,
        font_size=options.font_size,
        primary_color=options.color,
        outline_color=options.outline_color,
        back_color=options.back_color,
        position=options.position,
    )

    # ----------------------------------------------------
    # Step 7: Dubbing (Optional)
    # ----------------------------------------------------
    dub_wav_path: Optional[Path] = None
    if options.dub:
        tracker.start_step("dub", "Đang tạo lồng tiếng tiếng Việt...")
        if cancel_check and cancel_check():
            raise AppError(ErrorCode.JOB_CANCELLED)

        def _dub_prog(frac: float, msg: str):
            tracker.update(frac, msg)

        dub_wav_path, dub_clips = generate_dub(
            segments=translated_segments,
            video_duration=duration,
            job_dir=output_dir,
            voice=options.voice,
            dub_rate=options.dub_rate,
            progress_callback=_dub_prog,
            cancel_check=cancel_check,
        )

        # Update segment metadata with dub status and speed factor
        clip_map = {c.segment_id: c for c in dub_clips}
        for seg in translated_segments:
            cid = seg["id"]
            if cid in clip_map:
                c = clip_map[cid]
                seg["dub_text"] = c.text
                seg["dub_speed"] = c.speed_factor
                seg["dub_status"] = c.status

        tracker.update(1.0, "Hoàn tất tạo file lồng tiếng dub.wav")

    # ----------------------------------------------------
    # Step 8: Render Final Video
    # ----------------------------------------------------
    tracker.start_step("render", "Bắt đầu render video xuất xưởng...")
    if cancel_check and cancel_check():
        raise AppError(ErrorCode.JOB_CANCELLED)

    def _render_prog(frac: float, msg: str):
        tracker.update(frac, msg)

    final_output_mp4 = output_dir / "output.mp4"

    render_final_video(
        video_path=local_video,
        output_path=final_output_mp4,
        ass_path=ass_path,
        blur_regions=blur_regions if options.blur else None,
        dub_wav_path=dub_wav_path,
        orig_audio=options.orig_audio,
        video_width=width,
        video_height=height,
        duration=duration,
        blur_strength=options.blur_strength,
        fonts_dir=fonts_dir if fonts_dir.exists() else None,
        progress_callback=_render_prog,
        cancel_check=cancel_check,
    )

    tracker.finish("Xử lý hoàn tất!")

    blur_regions_dicts = [
        {
            "bbox": {"x": r.bbox.x, "y": r.bbox.y, "w": r.bbox.w, "h": r.bbox.h},
            "intervals": r.intervals,
        }
        for r in blur_regions
    ]

    return PipelineResult(
        video_path=local_video,
        output_mp4=final_output_mp4,
        srt_vi_path=srt_vi_path,
        srt_zh_path=srt_zh_path,
        dub_wav_path=dub_wav_path,
        segments=translated_segments,
        blur_regions=blur_regions_dicts,
    )
