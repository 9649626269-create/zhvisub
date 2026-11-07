"""Extract audio from video using FFmpeg."""

import json
import logging
import subprocess
from pathlib import Path

from app.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)


def extract_audio(video_path: Path, output_path: Path) -> Path:
    """
    Extract audio from video as 16kHz mono WAV.

    Args:
        video_path: Path to input video file.
        output_path: Path for output WAV file.

    Returns:
        Path to the extracted WAV file.

    Raises:
        AppError: If FFmpeg fails.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",                    # No video
        "-acodec", "pcm_s16le",   # 16-bit PCM
        "-ar", "16000",           # 16kHz
        "-ac", "1",               # Mono
        str(output_path),
    ]

    logger.info("Extracting audio: %s -> %s", video_path.name, output_path.name)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
        )
        if result.returncode != 0:
            stderr_tail = "\n".join(result.stderr.strip().split("\n")[-5:])
            raise AppError(
                ErrorCode.FFMPEG_ERROR,
                f"Lỗi tách audio (FFmpeg): {stderr_tail}",
            )
    except subprocess.TimeoutExpired:
        raise AppError(
            ErrorCode.FFMPEG_ERROR,
            "Tách audio quá thời gian cho phép (10 phút).",
        )

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise AppError(ErrorCode.FFMPEG_ERROR, "Tách audio thất bại: file rỗng.")

    logger.info("Audio extracted: %s (%d bytes)", output_path.name, output_path.stat().st_size)
    return output_path


def probe_video(video_path: Path) -> dict:
    """
    Probe video file with ffprobe and return metadata.

    Returns:
        Dict with keys: duration, width, height, has_audio, codec, rotation.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(video_path),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise AppError(ErrorCode.INVALID_VIDEO, "Video không hợp lệ hoặc bị hỏng.")
    except subprocess.TimeoutExpired:
        raise AppError(ErrorCode.INVALID_VIDEO, "Không thể đọc thông tin video.")
    except FileNotFoundError:
        raise AppError(ErrorCode.FFMPEG_ERROR, "Không tìm thấy ffprobe. Vui lòng cài FFmpeg.")

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise AppError(ErrorCode.INVALID_VIDEO, "Không thể đọc thông tin video.")

    streams = data.get("streams", [])
    fmt = data.get("format", {})

    video_stream = None
    has_audio = False
    for s in streams:
        if s.get("codec_type") == "video" and video_stream is None:
            video_stream = s
        if s.get("codec_type") == "audio":
            has_audio = True

    if video_stream is None:
        raise AppError(ErrorCode.INVALID_VIDEO, "Không tìm thấy luồng video trong file.")

    # Handle rotation from side_data_list or tags
    rotation = 0
    side_data = video_stream.get("side_data_list", [])
    for sd in side_data:
        if "rotation" in sd:
            rotation = abs(int(sd["rotation"]))
            break
    if rotation == 0:
        rot_tag = video_stream.get("tags", {}).get("rotate", "0")
        rotation = abs(int(rot_tag)) if rot_tag.isdigit() else 0

    width = int(video_stream.get("width", 0))
    height = int(video_stream.get("height", 0))

    # Swap dimensions if rotated 90/270
    if rotation in (90, 270):
        width, height = height, width

    duration = float(fmt.get("duration", 0))
    if duration == 0:
        duration = float(video_stream.get("duration", 0))

    return {
        "duration": duration,
        "width": width,
        "height": height,
        "has_audio": has_audio,
        "codec": video_stream.get("codec_name", "unknown"),
        "rotation": rotation,
    }


def extract_frame(
    video_path: Path,
    time_sec: float,
    output_path: Path,
    width: int = -1,
    height: int = -1,
) -> Path:
    """
    Extract a single frame from video at the given timestamp.

    Args:
        video_path: Path to input video.
        time_sec: Timestamp in seconds.
        output_path: Path for output JPEG.
        width, height: Optional resize (-1 to keep original).

    Returns:
        Path to the JPEG frame.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    vf_filters = []
    if width > 0 and height > 0:
        vf_filters.append(f"scale={width}:{height}")

    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{time_sec:.3f}",
        "-i", str(video_path),
        "-frames:v", "1",
    ]
    if vf_filters:
        cmd += ["-vf", ",".join(vf_filters)]
    cmd += ["-q:v", "2", str(output_path)]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0 or not output_path.exists():
        raise AppError(ErrorCode.FFMPEG_ERROR, "Không thể trích xuất khung hình.")

    return output_path
