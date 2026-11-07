"""Final video render using FFmpeg: blur + subtitle burn-in + audio mix in ONE command."""

import logging
import os
import re
import signal
import subprocess
import threading
from pathlib import Path
from typing import Callable, Optional

from app.config import settings
from app.errors import AppError, ErrorCode
from app.pipeline.ocr import BlurRegion

logger = logging.getLogger(__name__)

_filter_script_supported: Optional[bool] = None
_active_processes: dict[int, subprocess.Popen] = {}
_lock = threading.Lock()


def supports_filter_complex_script() -> bool:
    """Check if the current ffmpeg installation supports -filter_complex_script."""
    global _filter_script_supported
    if _filter_script_supported is not None:
        return _filter_script_supported

    try:
        res = subprocess.run(
            ["ffmpeg", "-h", "long"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
        )
        _filter_script_supported = "filter_complex_script" in res.stdout
    except Exception:
        _filter_script_supported = False
    return _filter_script_supported


def register_process(proc: subprocess.Popen) -> None:
    with _lock:
        _active_processes[proc.pid] = proc


def unregister_process(proc: subprocess.Popen) -> None:
    with _lock:
        _active_processes.pop(proc.pid, None)


def kill_all_active_renders() -> None:
    """Kill all currently running FFmpeg render processes."""
    with _lock:
        for pid, proc in list(_active_processes.items()):
            try:
                os.kill(pid, signal.SIGKILL)
            except (ProcessLookupError, OSError):
                pass
        _active_processes.clear()


def build_blur_filtergraph(
    regions: list[BlurRegion],
    video_width: int,
    video_height: int,
    blur_strength: int = 30,
    initial_input: str = "[0:v]",
) -> tuple[list[str], str]:
    """
    Build FFmpeg filtergraph lines for hard-sub blurring.
    Pattern: split -> crop -> gblur -> overlay (with enable='between(t,a,b)+...' on overlay).
    """
    if not regions:
        return [], initial_input

    lines: list[str] = []
    curr = initial_input

    for i, reg in enumerate(regions):
        bbox = reg.bbox
        # Clamp to bounds and enforce even numbers
        x = max(0, min(bbox.x, video_width - 2)) // 2 * 2
        y = max(0, min(bbox.y, video_height - 2)) // 2 * 2
        w = max(2, min(bbox.w, video_width - x)) // 2 * 2
        h = max(2, min(bbox.h, video_height - y)) // 2 * 2

        # Build enable condition
        intervals = reg.intervals
        if intervals:
            conds = [f"between(t,{st:.3f},{et:.3f})" for st, et in intervals]
            enable_str = ":enable='" + "+".join(conds) + "'"
        else:
            enable_str = ""

        sp_base = f"[b_base_{i}]"
        sp_crop = f"[b_crop_{i}]"
        blurred = f"[b_blur_{i}]"
        out_tag = f"[b_out_{i}]"

        lines.append(f"{curr}split=2{sp_base}{sp_crop}")
        lines.append(f"{sp_crop}crop={w}:{h}:{x}:{y},gblur=sigma={blur_strength}{blurred}")
        lines.append(f"{sp_base}{blurred}overlay={x}:{y}{enable_str}{out_tag}")

        curr = out_tag

    return lines, curr


def build_subtitle_filter(
    ass_path: Path,
    fonts_dir: Optional[Path] = None,
) -> str:
    """Build libass subtitle filter with path escaping."""
    safe_path = str(ass_path).replace("\\", "/").replace(":", "\\:")
    f = f"ass='{safe_path}'"
    if fonts_dir and fonts_dir.exists():
        safe_fonts = str(fonts_dir).replace("\\", "/").replace(":", "\\:")
        f += f":fontsdir='{safe_fonts}'"
    return f


def parse_ffmpeg_time_progress(line: str, duration: float) -> Optional[float]:
    """Parse out_time or out_time_ms from FFmpeg progress output."""
    m_ms = re.search(r'out_time_ms=(\d+)', line)
    if m_ms and duration > 0:
        val_s = int(m_ms.group(1)) / 1_000_000.0
        return min(1.0, max(0.0, val_s / duration))

    m_time = re.search(r'out_time=(\d+):(\d+):(\d+\.\d+)', line)
    if m_time and duration > 0:
        h, m, s = int(m_time.group(1)), int(m_time.group(2)), float(m_time.group(3))
        val_s = h * 3600 + m * 60 + s
        return min(1.0, max(0.0, val_s / duration))

    return None


def render_final_video(
    video_path: Path,
    output_path: Path,
    ass_path: Path,
    blur_regions: Optional[list[BlurRegion]] = None,
    dub_wav_path: Optional[Path] = None,
    orig_audio: str = "duck",  # "duck" | "mute" | "keep"
    video_width: int = 1920,
    video_height: int = 1080,
    duration: float = 0.0,
    blur_strength: int = 30,
    fonts_dir: Optional[Path] = None,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Path:
    """
    Render final video in ONE FFmpeg command:
    - Normalizes format and odd dimensions
    - Blurs hard subtitle regions (if any)
    - Burns in Vietnamese subtitles (ASS) via libass
    - Mixes audio according to orig_audio ("duck", "mute", "keep")
    - Encodes with H.264 yuv420p + AAC with -movflags +faststart
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    filter_lines: list[str] = []

    # 1. Base video normalization: enforce yuv420p & pad odd dimensions
    filter_lines.append("[0:v]format=yuv420p,pad=ceil(iw/2)*2:ceil(ih/2)*2[v_norm]")
    curr_v = "[v_norm]"

    # 2. Hardsub blur
    if blur_regions:
        blur_lines, curr_v = build_blur_filtergraph(
            regions=blur_regions,
            video_width=video_width,
            video_height=video_height,
            blur_strength=blur_strength,
            initial_input=curr_v,
        )
        filter_lines.extend(blur_lines)

    # 3. Subtitle burn-in (ASS)
    sub_filter = build_subtitle_filter(ass_path, fonts_dir)
    filter_lines.append(f"{curr_v}{sub_filter}[v_out]")

    # 4. Audio mixing
    audio_inputs = []
    has_dub = dub_wav_path and dub_wav_path.exists()

    if has_dub:
        audio_inputs.extend(["-i", str(dub_wav_path)])
        if orig_audio == "mute":
            # Only use dub audio
            filter_lines.append("[1:a]aformat=sample_rates=48000:channel_layouts=stereo[a_out]")
        elif orig_audio == "keep":
            # Mix 50/50 without ducking
            filter_lines.append(
                "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0,"
                "aformat=sample_rates=48000:channel_layouts=stereo[a_out]"
            )
        else:
            # "duck": reduce original by ~15dB (volume=0.18) when dubbing is active
            filter_lines.append(
                "[0:a]volume=0.18[a_duck];"
                "[a_duck][1:a]amix=inputs=2:duration=first:dropout_transition=0,"
                "aformat=sample_rates=48000:channel_layouts=stereo[a_out]"
            )
    else:
        filter_lines.append("[0:a]aformat=sample_rates=48000:channel_layouts=stereo[a_out]")

    # Write filtergraph script file
    script_path = output_path.parent / "render_filtergraph.txt"
    full_filter = ";\n".join(filter_lines)
    script_path.write_text(full_filter, encoding="utf-8")

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
    ]
    cmd.extend(audio_inputs)

    if supports_filter_complex_script():
        cmd.extend(["-filter_complex_script", str(script_path)])
    else:
        cmd.extend(["-filter_complex", full_filter])

    cmd.extend([
        "-map", "[v_out]",
        "-map", "[a_out]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-progress", "pipe:1",
        str(output_path),
    ])

    logger.info("Executing render command: %s", " ".join(cmd[:8]))

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    register_process(proc)

    stderr_lines = []

    def _collect_stderr():
        if proc.stderr:
            for l in proc.stderr:
                stderr_lines.append(l)

    t_err = threading.Thread(target=_collect_stderr, daemon=True)
    t_err.start()

    try:
        if proc.stdout:
            for line in proc.stdout:
                if cancel_check and cancel_check():
                    proc.kill()
                    raise AppError(ErrorCode.JOB_CANCELLED)

                frac = parse_ffmpeg_time_progress(line, duration)
                if frac is not None and progress_callback:
                    progress_callback(frac, f"Render video: {int(frac * 100)}%")

        proc.wait(timeout=3600)
        t_err.join(timeout=3)

        if proc.returncode != 0:
            tail = "".join(stderr_lines[-10:]) if stderr_lines else "FFmpeg exit non-zero"
            raise AppError(
                ErrorCode.RENDER_ERROR,
                f"Lỗi render video (code {proc.returncode}): {tail[-300:]}",
            )
    finally:
        unregister_process(proc)
        script_path.unlink(missing_ok=True)

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise AppError(ErrorCode.RENDER_ERROR, "Render video thất bại: file output không tồn tại hoặc rỗng.")

    return output_path
