"""ASR (Automatic Speech Recognition) using faster-whisper."""

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from app.config import settings
from app.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)

# Loaded model cache (loaded once per worker process)
_model = None
_model_name = None


@dataclass
class Segment:
    """A single transcribed segment."""
    id: int
    start: float
    end: float
    text: str


# Chinese punctuation for splitting long segments
_ZH_SENTENCE_END = re.compile(r'([。！？；…]+)')
_MAX_SEGMENT_DURATION = 8.0


def _get_model():
    """Get or load the Whisper model (cached per process)."""
    global _model, _model_name

    model_name = settings.whisper_model
    if _model is not None and _model_name == model_name:
        return _model

    from faster_whisper import WhisperModel

    # Determine compute type and device
    compute_type = settings.whisper_compute
    device = "cpu"

    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            if compute_type == "int8":
                compute_type = "float16"  # Use float16 on GPU
                logger.info("GPU detected, switching compute to float16")
    except ImportError:
        pass

    logger.info(
        "Loading Whisper model: %s (device=%s, compute=%s)",
        model_name, device, compute_type,
    )

    _model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        download_root=str(settings.models_dir / "whisper"),
    )
    _model_name = model_name

    logger.info("Whisper model loaded successfully.")
    return _model


def _split_long_segment(seg: dict, max_duration: float = _MAX_SEGMENT_DURATION) -> list[dict]:
    """
    Split a segment longer than max_duration by Chinese punctuation.

    Uses word_timestamps to find split points near punctuation marks.
    """
    duration = seg["end"] - seg["start"]
    if duration <= max_duration:
        return [seg]

    text = seg["text"]
    words = seg.get("words", [])

    if not words:
        # No word-level timestamps; split by character ratio
        parts = _ZH_SENTENCE_END.split(text)
        if len(parts) <= 1:
            return [seg]

        result = []
        sentences = []
        current = ""
        for i, part in enumerate(parts):
            current += part
            if i % 2 == 1:  # After punctuation
                sentences.append(current)
                current = ""
        if current:
            sentences.append(current)

        total_chars = sum(len(s) for s in sentences)
        if total_chars == 0:
            return [seg]

        current_time = seg["start"]
        total_duration = duration
        for s in sentences:
            frac = len(s) / total_chars
            s_duration = total_duration * frac
            result.append({
                "start": current_time,
                "end": current_time + s_duration,
                "text": s.strip(),
            })
            current_time += s_duration

        return [r for r in result if r["text"]]

    # With word timestamps: find split points at punctuation
    split_indices = []
    for i, w in enumerate(words):
        word_text = w.word if hasattr(w, 'word') else w.get("word", "")
        if _ZH_SENTENCE_END.search(word_text) and i < len(words) - 1:
            split_indices.append(i)

    if not split_indices:
        return [seg]

    result = []
    prev_idx = 0
    for split_idx in split_indices:
        chunk_words = words[prev_idx:split_idx + 1]
        if not chunk_words:
            continue

        first_w = chunk_words[0]
        last_w = chunk_words[-1]
        start = first_w.start if hasattr(first_w, 'start') else first_w.get("start", seg["start"])
        end = last_w.end if hasattr(last_w, 'end') else last_w.get("end", seg["end"])
        chunk_text = "".join(
            w.word if hasattr(w, 'word') else w.get("word", "")
            for w in chunk_words
        ).strip()

        if chunk_text:
            result.append({"start": start, "end": end, "text": chunk_text})
        prev_idx = split_idx + 1

    # Remaining words
    if prev_idx < len(words):
        chunk_words = words[prev_idx:]
        first_w = chunk_words[0]
        last_w = chunk_words[-1]
        start = first_w.start if hasattr(first_w, 'start') else first_w.get("start", seg["start"])
        end = last_w.end if hasattr(last_w, 'end') else last_w.get("end", seg["end"])
        chunk_text = "".join(
            w.word if hasattr(w, 'word') else w.get("word", "")
            for w in chunk_words
        ).strip()
        if chunk_text:
            result.append({"start": start, "end": end, "text": chunk_text})

    return result if result else [seg]


def transcribe(
    audio_path: Path,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> list[Segment]:
    """
    Transcribe Chinese audio using faster-whisper.

    Args:
        audio_path: Path to 16kHz mono WAV file.
        progress_callback: Called with (fraction 0-1, log_message).
        cancel_check: Returns True if job should be cancelled.

    Returns:
        List of Segment objects with id, start, end, text.

    Raises:
        AppError: NO_SPEECH if no speech detected; JOB_CANCELLED if cancelled.
    """
    model = _get_model()

    logger.info("Starting ASR on: %s", audio_path.name)

    segments_iter, info = model.transcribe(
        str(audio_path),
        language="zh",
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=True,
    )

    duration = info.duration
    if duration <= 0:
        raise AppError(ErrorCode.INVALID_VIDEO, "Không thể xác định độ dài audio.")

    raw_segments = []
    for seg in segments_iter:
        # Check cancellation
        if cancel_check and cancel_check():
            raise AppError(ErrorCode.JOB_CANCELLED)

        raw = {
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
            "words": seg.words or [],
        }

        # Split long segments
        splits = _split_long_segment(raw)
        raw_segments.extend(splits)

        # Report progress based on end time
        if progress_callback and duration > 0:
            frac = min(seg.end / duration, 1.0)
            progress_callback(frac, f"ASR: {seg.end:.1f}s / {duration:.1f}s")

    if not raw_segments:
        raise AppError(ErrorCode.NO_SPEECH)

    # Build final segments with IDs
    result = []
    for i, raw in enumerate(raw_segments, 1):
        if raw.get("text"):
            result.append(Segment(
                id=i,
                start=round(raw["start"], 3),
                end=round(raw["end"], 3),
                text=raw["text"],
            ))

    if not result:
        raise AppError(ErrorCode.NO_SPEECH)

    logger.info("ASR complete: %d segments from %.1f seconds", len(result), duration)
    return result
