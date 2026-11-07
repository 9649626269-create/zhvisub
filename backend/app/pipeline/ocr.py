"""OCR-based hard subtitle detection using PaddleOCR."""

import logging
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import numpy as np

from app.config import settings
from app.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)

# PaddleOCR model cache
_ocr_engine = None


@dataclass
class BBox:
    """A bounding box in pixel coordinates."""
    x: int
    y: int
    w: int
    h: int


@dataclass
class BlurRegion:
    """A region to blur with associated time intervals."""
    bbox: BBox
    intervals: list[tuple[float, float]] = field(default_factory=list)


@dataclass
class OCRResult:
    """Result of OCR detection."""
    regions: list[BlurRegion]
    has_hardsub: bool


def _get_ocr_engine():
    """Get or load PaddleOCR engine (cached per process)."""
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine

    from paddleocr import PaddleOCR

    logger.info("Loading PaddleOCR model...")
    _ocr_engine = PaddleOCR(
        lang="ch",
        use_angle_cls=True,
        show_log=False,
        use_gpu=_detect_gpu(),
        det_model_dir=str(settings.models_dir / "paddleocr" / "det"),
        rec_model_dir=str(settings.models_dir / "paddleocr" / "rec"),
        cls_model_dir=str(settings.models_dir / "paddleocr" / "cls"),
    )
    logger.info("PaddleOCR loaded.")
    return _ocr_engine


def _detect_gpu() -> bool:
    """Check if GPU is available for PaddlePaddle."""
    try:
        import paddle
        return paddle.device.is_compiled_with_cuda() and paddle.device.cuda.device_count() > 0
    except Exception:
        return False


def _extract_frames_batch(
    video_path: Path,
    fps: int,
    bottom_ratio: float,
    output_dir: Path,
) -> list[tuple[float, Path]]:
    """
    Extract frames from video at given FPS, cropping to bottom portion.

    Returns list of (timestamp, frame_path).
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # Calculate crop filter: keep only the bottom portion
    # We use ffmpeg's crop filter: crop=w:h:x:y
    # y = height * (1 - bottom_ratio), h = height * bottom_ratio
    crop_filter = (
        f"crop=iw:ih*{bottom_ratio}:0:ih*(1-{bottom_ratio})"
    )

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", f"{crop_filter},fps={fps}",
        "-q:v", "2",
        str(output_dir / "frame_%06d.jpg"),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        stderr_tail = "\n".join(result.stderr.strip().split("\n")[-5:])
        raise AppError(
            ErrorCode.OCR_ERROR,
            f"Lỗi trích xuất khung hình: {stderr_tail}",
        )

    # Collect output frames with timestamps
    frames = []
    frame_files = sorted(output_dir.glob("frame_*.jpg"))
    for i, fp in enumerate(frame_files):
        timestamp = i / fps
        frames.append((timestamp, fp))

    return frames


def _boxes_overlap(b1: tuple, b2: tuple, threshold: float = 0.7) -> bool:
    """Check if two boxes overlap significantly (IoU > threshold)."""
    x1, y1, w1, h1 = b1
    x2, y2, w2, h2 = b2

    ix = max(0, min(x1 + w1, x2 + w2) - max(x1, x2))
    iy = max(0, min(y1 + h1, y2 + h2) - max(y1, y2))
    intersection = ix * iy

    area1 = w1 * h1
    area2 = w2 * h2
    union = area1 + area2 - intersection

    if union == 0:
        return False

    return intersection / union > threshold


def _is_static_box(
    box_tuple: tuple,
    all_frame_boxes: list[list[tuple]],
    static_threshold: float = 0.8,
) -> bool:
    """
    Check if a box appears in most frames (likely a logo/watermark).

    A box is static if it overlaps with a similar box in > static_threshold
    of all frames.
    """
    total_frames = len(all_frame_boxes)
    if total_frames == 0:
        return False

    match_count = 0
    for frame_boxes in all_frame_boxes:
        for fb in frame_boxes:
            if _boxes_overlap(box_tuple, fb):
                match_count += 1
                break

    return match_count / total_frames > static_threshold


def merge_boxes(boxes_by_frame: dict[int, list[tuple]]) -> list[tuple]:
    """
    Merge detected boxes across frames into stable regions.

    A box must appear in >= 2 consecutive samples to be considered valid.
    Returns list of (x, y, w, h) tuples with 10% padding, rounded to even.
    """
    if not boxes_by_frame:
        return []

    # Find boxes that appear in consecutive frames
    sorted_frame_ids = sorted(boxes_by_frame.keys())
    stable_boxes: list[tuple] = []

    for i, fid in enumerate(sorted_frame_ids):
        if i == 0:
            continue
        prev_fid = sorted_frame_ids[i - 1]
        # Check consecutive frames (difference of 1 in frame index)
        if fid - prev_fid > 1:
            continue

        for box in boxes_by_frame[fid]:
            for prev_box in boxes_by_frame[prev_fid]:
                if _boxes_overlap(box, prev_box, threshold=0.5):
                    # Merge: take union of the two boxes
                    x = min(box[0], prev_box[0])
                    y = min(box[1], prev_box[1])
                    x2 = max(box[0] + box[2], prev_box[0] + prev_box[2])
                    y2 = max(box[1] + box[3], prev_box[1] + prev_box[3])
                    merged = (x, y, x2 - x, y2 - y)

                    # Check if this merged box overlaps with existing stable boxes
                    found = False
                    for j, sb in enumerate(stable_boxes):
                        if _boxes_overlap(merged, sb, threshold=0.3):
                            # Expand existing stable box
                            sx = min(sb[0], merged[0])
                            sy = min(sb[1], merged[1])
                            sx2 = max(sb[0] + sb[2], merged[0] + merged[2])
                            sy2 = max(sb[1] + sb[3], merged[1] + merged[3])
                            stable_boxes[j] = (sx, sy, sx2 - sx, sy2 - sy)
                            found = True
                            break
                    if not found:
                        stable_boxes.append(merged)

    # Add 10% padding and round to even
    padded = []
    for x, y, w, h in stable_boxes:
        pad_x = int(w * 0.1)
        pad_y = int(h * 0.1)
        nx = max(0, x - pad_x)
        ny = max(0, y - pad_y)
        nw = w + 2 * pad_x
        nh = h + 2 * pad_y
        # Round to even
        nx = nx // 2 * 2
        ny = ny // 2 * 2
        nw = (nw + 1) // 2 * 2
        nh = (nh + 1) // 2 * 2
        padded.append((nx, ny, nw, nh))

    return padded


def compute_blur_intervals(
    detections: list[tuple[float, tuple]],
    pre_pad: float = 0.3,
    post_pad: float = 0.3,
    merge_gap: float = 0.5,
) -> list[tuple[float, float]]:
    """
    Compute time intervals for blurring from OCR detections.

    Each detection is (timestamp, box_tuple).
    Intervals are padded and nearby intervals are merged.

    Returns sorted list of (start, end) intervals.
    """
    if not detections:
        return []

    # Create raw intervals with padding
    raw_intervals = []
    for ts, _ in detections:
        start = max(0, ts - pre_pad)
        end = ts + post_pad
        raw_intervals.append((start, end))

    # Sort by start time
    raw_intervals.sort()

    # Merge overlapping or close intervals
    merged = [raw_intervals[0]]
    for start, end in raw_intervals[1:]:
        prev_start, prev_end = merged[-1]
        if start - prev_end <= merge_gap:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))

    return merged


def detect_hardsubs(
    video_path: Path,
    video_width: int,
    video_height: int,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> OCRResult:
    """
    Detect hard-coded subtitles in video using PaddleOCR.

    Args:
        video_path: Path to input video.
        video_width: Video width in pixels.
        video_height: Video height in pixels.
        progress_callback: Called with (fraction 0-1, log_message).
        cancel_check: Returns True if job should be cancelled.

    Returns:
        OCRResult with blur regions and their time intervals.
    """
    fps = settings.ocr_fps
    bottom_ratio = settings.ocr_bottom_ratio

    logger.info("Starting OCR detection: fps=%d, bottom_ratio=%.2f", fps, bottom_ratio)

    # Extract frames
    with tempfile.TemporaryDirectory(prefix="zhvisub_ocr_") as tmpdir:
        frames_dir = Path(tmpdir) / "frames"
        frames = _extract_frames_batch(video_path, fps, bottom_ratio, frames_dir)

        if not frames:
            logger.info("No frames extracted for OCR")
            return OCRResult(regions=[], has_hardsub=False)

        total_frames = len(frames)
        logger.info("Extracted %d frames for OCR", total_frames)

        ocr = _get_ocr_engine()

        # Store detections per frame: frame_index -> list of (x, y, w, h)
        boxes_by_frame: dict[int, list[tuple]] = {}
        # Store all frame boxes for static detection
        all_frame_boxes: list[list[tuple]] = []
        # Store detections with timestamps for interval computation
        timed_detections: list[tuple[float, tuple]] = []

        bottom_y_offset = int(video_height * (1 - bottom_ratio))

        for i, (timestamp, frame_path) in enumerate(frames):
            if cancel_check and cancel_check():
                raise AppError(ErrorCode.JOB_CANCELLED)

            # Run OCR on frame
            try:
                img = np.array(_load_image(frame_path))
                results = ocr.ocr(img, cls=True)
            except Exception as e:
                logger.warning("OCR failed on frame %d: %s", i, e)
                all_frame_boxes.append([])
                continue

            frame_boxes = []
            if results and results[0]:
                for line in results[0]:
                    box_points = line[0]
                    text, conf = line[1]

                    # Filter by confidence
                    if conf < 0.6:
                        continue

                    # Convert box points to (x, y, w, h) in full video coords
                    xs = [p[0] for p in box_points]
                    ys = [p[1] for p in box_points]
                    x = int(min(xs))
                    y = int(min(ys)) + bottom_y_offset  # Offset to full frame
                    w = int(max(xs) - min(xs))
                    h = int(max(ys) - min(ys))

                    box_tuple = (x, y, w, h)
                    frame_boxes.append(box_tuple)
                    timed_detections.append((timestamp, box_tuple))

            boxes_by_frame[i] = frame_boxes
            all_frame_boxes.append(frame_boxes)

            if progress_callback:
                progress_callback(
                    (i + 1) / total_frames,
                    f"OCR: {i + 1}/{total_frames} khung hình",
                )

        if not timed_detections:
            logger.info("No hard subtitles detected")
            return OCRResult(regions=[], has_hardsub=False)

        # Filter out static boxes (logos/watermarks)
        filtered_detections = []
        for ts, box in timed_detections:
            if not _is_static_box(box, all_frame_boxes):
                filtered_detections.append((ts, box))

        if not filtered_detections:
            logger.info("All detected boxes are static (logos/watermarks)")
            return OCRResult(regions=[], has_hardsub=False)

        # Merge boxes into stable regions
        # Re-build boxes_by_frame with filtered detections
        filtered_by_frame: dict[int, list[tuple]] = {}
        frame_ts_map = {i: ts for i, (ts, _) in enumerate(frames)}
        ts_to_frame = {}
        for i, (ts, _) in enumerate(frames):
            ts_to_frame[ts] = i

        for ts, box in filtered_detections:
            fid = ts_to_frame.get(ts, -1)
            if fid >= 0:
                filtered_by_frame.setdefault(fid, []).append(box)

        stable_boxes = merge_boxes(filtered_by_frame)

        if not stable_boxes:
            return OCRResult(regions=[], has_hardsub=False)

        # For each stable region, compute blur intervals
        regions = []
        for sbox in stable_boxes:
            # Find all detections that fall within this stable region
            region_detections = []
            for ts, box in filtered_detections:
                if _boxes_overlap(box, sbox, threshold=0.3):
                    region_detections.append((ts, box))

            intervals = compute_blur_intervals(region_detections)

            if intervals:
                regions.append(BlurRegion(
                    bbox=BBox(x=sbox[0], y=sbox[1], w=sbox[2], h=sbox[3]),
                    intervals=intervals,
                ))

        logger.info("OCR complete: %d blur regions detected", len(regions))
        return OCRResult(regions=regions, has_hardsub=bool(regions))


def _load_image(path: Path):
    """Load image using PIL."""
    from PIL import Image
    return Image.open(path).convert("RGB")
