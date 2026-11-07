"""Vietnamese dubbing module using TTS (edge-tts with piper fallback)."""

import asyncio
import hashlib
import logging
import re
import subprocess
import wave
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import numpy as np

from app.config import settings
from app.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)


@dataclass
class DubClip:
    """A single dubbed audio clip metadata."""
    segment_id: int
    start: float
    end: float
    budget: float
    text: str
    audio_path: Optional[Path] = None
    duration: float = 0.0
    speed_factor: float = 1.0
    status: str = "ok"  # "ok" | "stretched" | "shortened" | "overflow"


# ============================================================
# Text normalization for TTS (Pure function)
# ============================================================

_DIGIT_MAP = {
    0: "không",
    1: "một",
    2: "hai",
    3: "ba",
    4: "bốn",
    5: "năm",
    6: "sáu",
    7: "bảy",
    8: "tám",
    9: "chín",
}

_UNIT_MAP = {
    "km/h": "ki-lô-mét trên giờ",
    "m/s": "mét trên giây",
    "km": "ki-lô-mét",
    "m": "mét",
    "cm": "xen-ti-mét",
    "mm": "mi-li-mét",
    "kg": "ki-lô-gam",
    "g": "gam",
    "mg": "mi-li-gam",
    "l": "lít",
    "ml": "mi-li-lít",
    "usd": "đô la",
    "vnd": "đồng",
    "đ": "đồng",
}


def _read_int_under_100(val: int) -> str:
    """Convert integer < 100 to Vietnamese words."""
    if val < 10:
        return _DIGIT_MAP[val]
    tens = val // 10
    ones = val % 10
    tens_str = "mười" if tens == 1 else f"{_DIGIT_MAP[tens]} mươi"
    if ones == 0:
        return tens_str
    if ones == 1:
        ones_str = "mốt" if tens > 1 else "một"
    elif ones == 4:
        ones_str = "tư" if tens > 1 else "bốn"
    elif ones == 5:
        ones_str = "lăm"
    else:
        ones_str = _DIGIT_MAP[ones]
    return f"{tens_str} {ones_str}"


def _read_int_under_1000(val: int, has_higher_group: bool = False) -> str:
    """Convert integer < 1000 to Vietnamese words."""
    hundreds = val // 100
    rem = val % 100
    if hundreds == 0 and not has_higher_group:
        return _read_int_under_100(val)

    h_str = f"{_DIGIT_MAP[hundreds]} trăm"
    if rem == 0:
        return h_str
    if rem < 10:
        return f"{h_str} lẻ {_DIGIT_MAP[rem]}"
    return f"{h_str} {_read_int_under_100(rem)}"


def int_to_vietnamese_words(val: int) -> str:
    """Convert an arbitrary non-negative integer to Vietnamese words."""
    if val == 0:
        return "không"
    if val < 0:
        return f"âm {int_to_vietnamese_words(-val)}"

    groups = []
    names = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"]
    curr = val
    idx = 0
    while curr > 0:
        rem = curr % 1000
        curr //= 1000
        if rem > 0:
            part = _read_int_under_1000(rem, has_higher_group=(curr > 0))
            suffix = f" {names[idx]}" if names[idx] else ""
            groups.insert(0, f"{part}{suffix}")
        idx += 1

    return " ".join(groups).strip()


def number_str_to_words(num_str: str) -> str:
    """Convert decimal or integer string to Vietnamese words."""
    cleaned = num_str.replace(" ", "")
    if "," in cleaned or "." in cleaned:
        # Check decimal point
        sep = "," if "," in cleaned else "."
        parts = cleaned.split(sep, 1)
        int_part = int(parts[0]) if parts[0].isdigit() else 0
        int_words = int_to_vietnamese_words(int_part)
        dec_digits = [c for c in parts[1] if c.isdigit()]
        if dec_digits:
            dec_words = " ".join(_DIGIT_MAP[int(d)] for d in dec_digits)
            return f"{int_words} phẩy {dec_words}"
        return int_words
    try:
        val = int(cleaned)
        return int_to_vietnamese_words(val)
    except ValueError:
        return num_str


def normalize_text_for_tts(text: str) -> str:
    """
    Pure text normalization for Vietnamese TTS:
    - Normalizes percentages (e.g., '50%', '3.5%')
    - Normalizes units (e.g., '100km', '5kg')
    - Normalizes standalone numbers (e.g., '2024')
    """
    if not text:
        return ""

    s = text.strip()

    # 1. Percentages: 50% -> năm mươi phần trăm
    def _replace_percent(match: re.Match) -> str:
        num = match.group(1)
        return f"{number_str_to_words(num)} phần trăm"

    s = re.sub(r'(\d+(?:[.,]\d+)?)\s*%', _replace_percent, s)

    # 2. Units with numbers: 100km, 2.5 kg
    unit_keys = sorted(_UNIT_MAP.keys(), key=len, reverse=True)
    unit_pattern = re.compile(
        r'(\d+(?:[.,]\d+)?)\s*(' + '|'.join(re.escape(k) for k in unit_keys) + r')\b',
        re.IGNORECASE,
    )

    def _replace_unit(match: re.Match) -> str:
        num = match.group(1)
        unit = match.group(2).lower()
        unit_vi = _UNIT_MAP.get(unit, unit)
        return f"{number_str_to_words(num)} {unit_vi}"

    s = unit_pattern.sub(_replace_unit, s)

    # 3. Standalone numbers
    def _replace_number(match: re.Match) -> str:
        return number_str_to_words(match.group(0))

    s = re.sub(r'\b\d+(?:[.,]\d+)?\b', _replace_number, s)

    # 4. Clean extra spaces
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# ============================================================
# Budget calculation (Pure function)
# ============================================================

def compute_budgets(
    segments: list[dict],
    video_duration: float,
    max_spill_ms: int = 400,
) -> list[DubClip]:
    """
    Compute time budget for each segment's dubbing:
    Budget = (seg["end"] - seg["start"]) + silence before next segment (leaving 80ms buffer, max max_spill_ms).
    Never exceeds start of next segment (last segment: until end of video).
    """
    max_spill_s = max_spill_ms / 1000.0
    buffer_s = 0.08  # 80ms silence before next sentence

    clips: list[DubClip] = []
    n = len(segments)

    for i, seg in enumerate(segments):
        start = float(seg["start"])
        end = float(seg["end"])
        base_dur = max(0.01, end - start)

        if i < n - 1:
            next_start = float(segments[i + 1]["start"])
            gap = max(0.0, next_start - end)
            available_spill = max(0.0, gap - buffer_s)
            spill = min(available_spill, max_spill_s)
        else:
            gap = max(0.0, video_duration - end)
            spill = min(gap, max_spill_s)

        budget = base_dur + spill
        text = seg.get("dub_text") or seg.get("vi") or ""

        clips.append(DubClip(
            segment_id=int(seg.get("id", i + 1)),
            start=start,
            end=end,
            budget=round(budget, 3),
            text=text,
        ))

    return clips


# ============================================================
# Audio helpers (FFmpeg atempo, trim silence, duration)
# ============================================================

def get_audio_duration(file_path: Path) -> float:
    """Get precise duration of an audio file in seconds via ffprobe."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    try:
        return float(res.stdout.strip())
    except (ValueError, AttributeError):
        return 0.0


def trim_silence(input_wav: Path, output_wav: Path) -> Path:
    """Trim leading and trailing silence from an audio clip."""
    output_wav.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_wav),
        "-af", (
            "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-40dB,"
            "areverse,"
            "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-40dB,"
            "areverse"
        ),
        str(output_wav),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if res.returncode != 0 or not output_wav.exists() or output_wav.stat().st_size == 0:
        return input_wav
    return output_wav


def change_speed_atempo(input_wav: Path, output_wav: Path, speed: float) -> Path:
    """
    Change audio speed using FFmpeg atempo filter.
    atempo accepts values between 0.5 and 2.0; chain if necessary.
    """
    output_wav.parent.mkdir(parents=True, exist_ok=True)
    filters = []
    rem = speed
    while rem > 2.0:
        filters.append("atempo=2.0")
        rem /= 2.0
    while rem < 0.5:
        filters.append("atempo=0.5")
        rem /= 0.5
    filters.append(f"atempo={rem:.4f}")

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_wav),
        "-af", ",".join(filters),
        str(output_wav),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if res.returncode != 0:
        raise AppError(ErrorCode.TTS_ERROR, f"Lỗi tăng tốc độ audio: {res.stderr[:200]}")
    return output_wav


def cut_and_fade_out(input_wav: Path, output_wav: Path, max_duration: float, fade_ms: int = 50) -> Path:
    """Cut audio to max_duration and apply fade-out at the end."""
    output_wav.parent.mkdir(parents=True, exist_ok=True)
    fade_s = fade_ms / 1000.0
    start_fade = max(0.0, max_duration - fade_s)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_wav),
        "-t", f"{max_duration:.3f}",
        "-af", f"afade=t=out:st={start_fade:.3f}:d={fade_s:.3f}",
        str(output_wav),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if res.returncode != 0:
        raise AppError(ErrorCode.TTS_ERROR, f"Lỗi cắt audio: {res.stderr[:200]}")
    return output_wav


# ============================================================
# TTS Synthesis (Edge-TTS & Piper fallback)
# ============================================================

def _tts_cache_hash(text: str, voice: str, rate: str) -> str:
    h = hashlib.sha256(f"{text}|{voice}|{rate}".encode("utf-8")).hexdigest()[:16]
    return h


async def _synthesize_edge_async(text: str, voice: str, rate: str, output_path: Path) -> Path:
    import edge_tts
    output_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(str(output_path))
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise AppError(ErrorCode.TTS_ERROR, "edge-tts tạo file âm thanh rỗng.")
    return output_path


def _synthesize_piper(text: str, voice: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "piper",
        "--model", voice,
        "--output_file", str(output_path),
    ]
    res = subprocess.run(cmd, input=text, capture_output=True, text=True, timeout=45)
    if res.returncode != 0:
        raise AppError(ErrorCode.TTS_ERROR, f"Piper TTS lỗi: {res.stderr[:200]}")
    return output_path


def synthesize_tts_single(
    text: str,
    output_path: Path,
    voice: str | None = None,
    rate: str = "+0%",
) -> Path:
    """Synthesize text to audio using edge-tts with piper fallback."""
    if not text.strip():
        raise AppError(ErrorCode.TTS_ERROR, "Văn bản lồng tiếng rỗng.")

    voice = voice or settings.tts_voice
    provider = settings.tts_provider

    if provider == "edge":
        try:
            asyncio.run(_synthesize_edge_async(text, voice, rate, output_path))
            return output_path
        except Exception as exc:
            logger.warning("edge-tts thất bại (%s), chuyển sang piper offline fallback", exc)
            return _synthesize_piper(text, voice, output_path)
    else:
        return _synthesize_piper(text, voice, output_path)


def shorten_text_with_llm(text: str) -> Optional[str]:
    """Call LLM to shorten text while preserving core meaning."""
    try:
        from openai import OpenAI
        client = OpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key or "dummy",
            timeout=20.0,
        )
        resp = client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Bạn là biên tập viên lồng tiếng. Hãy rút gọn câu tiếng Việt sau sao cho ngắn gọn nhất, "
                        "giữ nguyên ý chính để đọc nhanh hơn. Chỉ trả về duy nhất câu đã rút gọn."
                    ),
                },
                {"role": "user", "content": text},
            ],
            temperature=0.2,
            max_tokens=256,
        )
        shortened = resp.choices[0].message.content.strip()
        if shortened and len(shortened) < len(text):
            return shortened
    except Exception as exc:
        logger.warning("Rút gọn văn bản qua LLM thất bại: %s", exc)
    return None


# ============================================================
# Main Dubbing Pipeline
# ============================================================

def process_single_clip(
    clip: DubClip,
    cache_dir: Path,
    voice: str,
    rate: str,
    max_speedup: float,
) -> DubClip:
    """Generate audio and adjust timing for a single DubClip."""
    norm_text = normalize_text_for_tts(clip.text)
    clip_hash = _tts_cache_hash(norm_text, voice, rate)
    raw_wav = cache_dir / f"{clip_hash}_raw.wav"
    trimmed_wav = cache_dir / f"{clip_hash}_trimmed.wav"

    if not trimmed_wav.exists():
        synthesize_tts_single(norm_text, raw_wav, voice=voice, rate=rate)
        trim_silence(raw_wav, trimmed_wav)

    dur = get_audio_duration(trimmed_wav)
    if dur <= 0:
        clip.status = "overflow"
        return clip

    budget = clip.budget
    ratio = dur / budget if budget > 0 else float('inf')

    if ratio <= 1.0:
        # Fits budget
        clip.audio_path = trimmed_wav
        clip.duration = dur
        clip.speed_factor = 1.0
        clip.status = "ok"
        return clip

    if ratio <= max_speedup:
        # Speed up within limit
        sped_wav = cache_dir / f"{clip_hash}_speed_{ratio:.3f}.wav"
        change_speed_atempo(trimmed_wav, sped_wav, ratio)
        clip.audio_path = sped_wav
        clip.duration = get_audio_duration(sped_wav)
        clip.speed_factor = round(ratio, 3)
        clip.status = "stretched"
        return clip

    # Exceeds max speedup: try shortening text with LLM
    shortened_text = shorten_text_with_llm(clip.text)
    if shortened_text:
        clip.text = shortened_text  # store as dub_text
        short_norm = normalize_text_for_tts(shortened_text)
        short_hash = _tts_cache_hash(short_norm, voice, rate)
        s_raw = cache_dir / f"{short_hash}_raw.wav"
        s_trimmed = cache_dir / f"{short_hash}_trimmed.wav"

        synthesize_tts_single(short_norm, s_raw, voice=voice, rate=rate)
        trim_silence(s_raw, s_trimmed)

        s_dur = get_audio_duration(s_trimmed)
        s_ratio = s_dur / budget if budget > 0 else float('inf')

        if s_ratio <= 1.0:
            clip.audio_path = s_trimmed
            clip.duration = s_dur
            clip.speed_factor = 1.0
            clip.status = "shortened"
            return clip

        if s_ratio <= max_speedup:
            sped_wav = cache_dir / f"{short_hash}_speed_{s_ratio:.3f}.wav"
            change_speed_atempo(s_trimmed, sped_wav, s_ratio)
            clip.audio_path = sped_wav
            clip.duration = get_audio_duration(sped_wav)
            clip.speed_factor = round(s_ratio, 3)
            clip.status = "shortened"
            return clip

        # Still exceeds max speedup after shortening: force max speedup and cut
        forced_wav = cache_dir / f"{short_hash}_forced_{max_speedup}.wav"
        change_speed_atempo(s_trimmed, forced_wav, max_speedup)
        cut_wav = cache_dir / f"{short_hash}_cut.wav"
        cut_and_fade_out(forced_wav, cut_wav, budget)
        clip.audio_path = cut_wav
        clip.duration = budget
        clip.speed_factor = max_speedup
        clip.status = "overflow"
        return clip

    # No shortening possible: force max speedup and cut + fade
    forced_wav = cache_dir / f"{clip_hash}_forced_{max_speedup}.wav"
    change_speed_atempo(trimmed_wav, forced_wav, max_speedup)
    cut_wav = cache_dir / f"{clip_hash}_cut.wav"
    cut_and_fade_out(forced_wav, cut_wav, budget)
    clip.audio_path = cut_wav
    clip.duration = budget
    clip.speed_factor = max_speedup
    clip.status = "overflow"
    return clip


def build_dub_timeline_wav(
    clips: list[DubClip],
    video_duration: float,
    output_wav: Path,
    sample_rate: int = 48000,
) -> Path:
    """
    Build the final dub.wav at 48kHz mono:
    - Places clips at their start sample offsets
    - Normalizes each clip volume
    - Applies 10ms fade in/out
    - Total length exactly equals video duration
    - No overlapping with subsequent sentences
    """
    total_samples = int(video_duration * sample_rate)
    master_track = np.zeros(total_samples, dtype=np.float32)
    fade_samples = int(0.010 * sample_rate)  # 10ms fade

    for clip in clips:
        if not clip.audio_path or not clip.audio_path.exists():
            continue

        # Load audio into 48kHz float32
        clip_data = load_wav_as_float32(clip.audio_path, target_sr=sample_rate)
        if clip_data is None or len(clip_data) == 0:
            continue

        # Normalize volume
        peak = np.max(np.abs(clip_data))
        if peak > 0:
            clip_data = clip_data * (0.9 / peak)

        # 10ms fade in / fade out
        if len(clip_data) > 2 * fade_samples:
            clip_data[:fade_samples] *= np.linspace(0, 1, fade_samples, dtype=np.float32)
            clip_data[-fade_samples:] *= np.linspace(1, 0, fade_samples, dtype=np.float32)

        start_sample = int(clip.start * sample_rate)
        end_sample = start_sample + len(clip_data)

        if start_sample >= total_samples:
            continue
        if end_sample > total_samples:
            clip_data = clip_data[:total_samples - start_sample]
            end_sample = total_samples

        master_track[start_sample:end_sample] += clip_data

    # Soft clamp
    master_track = np.clip(master_track, -1.0, 1.0)
    int16_samples = (master_track * 32767).astype(np.int16)

    output_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int16_samples.tobytes())

    return output_wav


def load_wav_as_float32(path: Path, target_sr: int = 48000) -> Optional[np.ndarray]:
    """Load audio file via FFmpeg and convert to 1D float32 array at target sample rate."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(path),
        "-ar", str(target_sr),
        "-ac", "1",
        "-f", "s16le",
        "-",
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if res.returncode != 0 or not res.stdout:
        return None
    raw = np.frombuffer(res.stdout, dtype=np.int16)
    return raw.astype(np.float32) / 32768.0


def generate_dub(
    segments: list[dict],
    video_duration: float,
    job_dir: Path,
    voice: Optional[str] = None,
    dub_rate: str = "+0%",
    progress_callback: Optional[Callable[[float, str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> tuple[Path, list[DubClip]]:
    """
    Main entry point for generating Vietnamese dubbing:
    - Calculates budgets
    - Synthesizes TTS concurrently (DUB_CONCURRENCY)
    - Stretches or shortens text to fit
    - Builds timeline dub.wav 48kHz
    """
    voice = voice or settings.tts_voice
    max_speedup = settings.dub_max_speedup
    concurrency = min(settings.dub_concurrency, 4)

    clips = compute_budgets(segments, video_duration, settings.dub_max_spill_ms)
    if not clips:
        raise AppError(ErrorCode.TTS_ERROR, "Không có câu nào để lồng tiếng.")

    cache_dir = job_dir / "tts_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    processed_clips: list[DubClip] = [None] * len(clips)  # type: ignore
    total = len(clips)
    done_count = 0

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_map = {
            executor.submit(
                process_single_clip, clip, cache_dir, voice, dub_rate, max_speedup
            ): i
            for i, clip in enumerate(clips)
        }

        for future in as_completed(future_map):
            if cancel_check and cancel_check():
                raise AppError(ErrorCode.JOB_CANCELLED)
            idx = future_map[future]
            res_clip = future.result()
            processed_clips[idx] = res_clip
            done_count += 1
            if progress_callback:
                progress_callback(
                    done_count / total,
                    f"Lồng tiếng: {done_count}/{total} câu ({res_clip.status})",
                )

    dub_wav_path = job_dir / "dub.wav"
    build_dub_timeline_wav(processed_clips, video_duration, dub_wav_path)

    return dub_wav_path, processed_clips


async def list_voices() -> list[dict]:
    """Get available Vietnamese TTS voices."""
    if settings.tts_provider == "edge":
        try:
            import edge_tts
            voices = await edge_tts.list_voices()
            vi_voices = [
                {"name": v["ShortName"], "gender": v["Gender"], "locale": v["Locale"]}
                for v in voices
                if v.get("Locale", "").startswith("vi")
            ]
            if vi_voices:
                return vi_voices
        except Exception as exc:
            logger.warning("Không thể lấy danh sách giọng từ edge-tts: %s", exc)

    return [
        {"name": "vi-VN-HoaiMyNeural", "gender": "Female", "locale": "vi-VN"},
        {"name": "vi-VN-NamMinhNeural", "gender": "Male", "locale": "vi-VN"},
    ]
