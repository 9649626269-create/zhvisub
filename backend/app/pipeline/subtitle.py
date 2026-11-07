"""Subtitle generation: SRT and ASS formats."""

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Max chars per line and per cue
MAX_CHARS_PER_LINE = 42
MAX_CHARS_PER_CUE = 84


def _format_srt_time(seconds: float) -> str:
    """Format seconds as SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _format_ass_time(seconds: float) -> str:
    """Format seconds as ASS timestamp: H:MM:SS.cc"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _wrap_text(text: str, max_chars: int = MAX_CHARS_PER_LINE) -> str:
    """Wrap text to max_chars per line, max 2 lines."""
    if len(text) <= max_chars:
        return text
    
    # Try to break at a natural point (space, comma, period)
    mid = len(text) // 2
    best_break = mid
    
    # Look for a break point near the middle
    for offset in range(min(10, mid)):
        for pos in [mid + offset, mid - offset]:
            if 0 < pos < len(text):
                if text[pos] in " ,，、。！？；：":
                    best_break = pos + 1
                    break
                elif text[pos - 1] in " ,，、。！？；：":
                    best_break = pos
                    break
        else:
            continue
        break
    
    line1 = text[:best_break].strip()
    line2 = text[best_break:].strip()
    return f"{line1}\n{line2}"


def split_long_cue(
    text: str,
    start: float,
    end: float,
    max_chars: int = MAX_CHARS_PER_CUE,
) -> list[tuple[str, float, float]]:
    """
    Split a long text into multiple cues, distributing time by character ratio.
    
    Returns list of (text, start, end).
    """
    if len(text) <= max_chars:
        return [(_wrap_text(text), start, end)]
    
    # Split by sentences or natural breaks
    parts = re.split(r'([。！？；…，,]+)', text)
    
    # Recombine parts with their punctuation
    sentences = []
    current = ""
    for i, part in enumerate(parts):
        current += part
        if i % 2 == 1:  # After punctuation
            sentences.append(current.strip())
            current = ""
    if current.strip():
        sentences.append(current.strip())
    
    if not sentences:
        sentences = [text]
    
    # Merge small sentences to get chunks close to max_chars
    chunks = []
    current_chunk = ""
    for s in sentences:
        if len(current_chunk) + len(s) <= max_chars:
            current_chunk += s
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = s
    if current_chunk:
        chunks.append(current_chunk)
    
    # If sentences still have chunks > max_chars, split them by whitespace
    final_chunks = []
    for c in chunks:
        if len(c) <= max_chars:
            final_chunks.append(c)
        else:
            words = c.split()
            cur = ""
            for w in words:
                cand = f"{cur} {w}".strip() if cur else w
                if len(cand) <= max_chars:
                    cur = cand
                else:
                    if cur:
                        final_chunks.append(cur)
                    cur = w
            if cur:
                final_chunks.append(cur)

    chunks = final_chunks if final_chunks else [text]
    
    # Distribute time by character ratio
    total_chars = sum(len(c) for c in chunks)
    if total_chars == 0:
        return [(_wrap_text(text), start, end)]
    
    total_duration = end - start
    result = []
    current_time = start
    
    for chunk in chunks:
        frac = len(chunk) / total_chars
        chunk_duration = total_duration * frac
        chunk_end = current_time + chunk_duration
        result.append((_wrap_text(chunk), current_time, chunk_end))
        current_time = chunk_end
    
    return result


def generate_srt(
    segments: list[dict],
    output_path: Path,
    text_key: str = "vi",
) -> Path:
    """
    Generate an SRT subtitle file.
    
    Args:
        segments: List of {"id": int, "start": float, "end": float, "zh": str, "vi": str}.
        output_path: Path for output .srt file.
        text_key: Which text field to use ("vi" or "zh").
    
    Returns:
        Path to the generated SRT file.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    cue_index = 1
    lines = []
    
    for seg in segments:
        text = seg.get(text_key, "")
        if not text:
            continue
        
        cues = split_long_cue(text, seg["start"], seg["end"])
        for cue_text, cue_start, cue_end in cues:
            lines.append(str(cue_index))
            lines.append(
                f"{_format_srt_time(cue_start)} --> {_format_srt_time(cue_end)}"
            )
            lines.append(cue_text)
            lines.append("")
            cue_index += 1
    
    output_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info("Generated SRT (%s): %s (%d cues)", text_key, output_path.name, cue_index - 1)
    return output_path


def generate_ass(
    segments: list[dict],
    output_path: Path,
    video_width: int,
    video_height: int,
    font_name: str = "Noto Sans",
    font_size: int = 0,
    primary_color: str = "&H00FFFFFF",  # White
    outline_color: str = "&H00000000",  # Black
    back_color: str = "&H80000000",     # Semi-transparent black
    position: str = "bottom",           # bottom | top
    margin_v: int = 30,
) -> Path:
    """
    Generate an ASS subtitle file for burn-in with libass.
    
    Args:
        segments: Segments with "vi" text.
        output_path: Path for output .ass file.
        video_width, video_height: Video resolution for PlayRes.
        font_name: Font family name.
        font_size: Font size (0 = auto based on resolution).
        primary_color: ASS color for text.
        outline_color: ASS color for outline.
        back_color: ASS color for background box.
        position: "bottom" or "top".
        margin_v: Vertical margin in pixels.
    
    Returns:
        Path to generated .ass file.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    if font_size <= 0:
        # Auto-size based on video height
        font_size = max(24, video_height // 20)
    
    # Alignment: 2 = bottom center, 8 = top center
    alignment = 2 if position == "bottom" else 8
    
    # Bold=1, Outline=2, Shadow=1, BorderStyle=3 (opaque box)
    header = f"""[Script Info]
Title: ZhViSub
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_size},{primary_color},&H000000FF,{outline_color},{back_color},-1,0,0,0,100,100,0,0,3,2,0,{alignment},20,20,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    
    events = []
    for seg in segments:
        text = seg.get("vi", "")
        if not text:
            continue
        
        cues = split_long_cue(text, seg["start"], seg["end"])
        for cue_text, cue_start, cue_end in cues:
            # Replace newlines with \N for ASS format
            ass_text = cue_text.replace("\n", "\\N")
            events.append(
                f"Dialogue: 0,{_format_ass_time(cue_start)},{_format_ass_time(cue_end)},"
                f"Default,,0,0,0,,{ass_text}"
            )
    
    content = header + "\n".join(events) + "\n"
    output_path.write_text(content, encoding="utf-8-sig")  # BOM for compatibility
    
    logger.info("Generated ASS: %s (%d events)", output_path.name, len(events))
    return output_path
