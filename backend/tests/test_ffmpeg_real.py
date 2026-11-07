"""Tests using real FFmpeg and ffprobe:
1. Audio speedup with atempo produces duration <= budget ±50ms
2. Final render produces valid MP4 (verified by ffprobe) with video + audio streams
"""

import subprocess
import pytest
from pathlib import Path

from app.pipeline.audio import probe_video
from app.pipeline.dub import change_speed_atempo, get_audio_duration
from app.pipeline.ocr import BBox, BlurRegion
from app.pipeline.render import render_final_video
from app.pipeline.subtitle import generate_ass


def create_synthetic_video(output_mp4: Path, duration_s: int = 3, width: int = 640, height: int = 360):
    """Create a synthetic test video with video (testsrc) and audio (sine tone) via ffmpeg."""
    output_mp4.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"testsrc=duration={duration_s}:size={width}x{height}:rate=24",
        "-f", "lavfi", "-i", f"sine=frequency=1000:duration={duration_s}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        str(output_mp4),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    assert res.returncode == 0, f"Failed to create synthetic video: {res.stderr}"


def create_synthetic_audio(output_wav: Path, duration_s: float = 2.0):
    """Create a synthetic test WAV tone via ffmpeg."""
    output_wav.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration_s}",
        "-ar", "16000", "-ac", "1",
        str(output_wav),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    assert res.returncode == 0, f"Failed to create synthetic audio: {res.stderr}"


class TestRealFFmpeg:
    def test_atempo_speedup_within_budget(self, tmp_path):
        # Original clip duration = 2.0s
        input_wav = tmp_path / "orig_2s.wav"
        create_synthetic_audio(input_wav, duration_s=2.0)
        orig_dur = get_audio_duration(input_wav)
        assert orig_dur == pytest.approx(2.0, 0.05)

        # Target budget = 1.5s -> speed factor = 2.0 / 1.5 = 1.3333
        budget = 1.5
        speed_factor = orig_dur / budget
        output_wav = tmp_path / "sped.wav"

        change_speed_atempo(input_wav, output_wav, speed_factor)
        new_dur = get_audio_duration(output_wav)

        # Requirement: clip sau atempo dài <= ngân sách ±50ms
        tolerance = 0.050  # 50ms
        assert new_dur <= budget + tolerance
        assert abs(new_dur - budget) <= tolerance

    def test_render_final_video_valid_mp4(self, tmp_path):
        # 1. Create a 3-second synthetic input video
        video_path = tmp_path / "source.mp4"
        create_synthetic_video(video_path, duration_s=3, width=640, height=360)

        # 2. Generate a valid ASS subtitle
        ass_path = tmp_path / "subs.ass"
        generate_ass(
            segments=[{"id": 1, "start": 0.5, "end": 2.5, "vi": "Phụ đề thử nghiệm render"}],
            output_path=ass_path,
            video_width=640,
            video_height=360,
        )

        # 3. Create a blur region covering bottom subtitle area
        blur_regions = [
            BlurRegion(
                bbox=BBox(x=50, y=280, w=540, h=50),
                intervals=[(0.5, 2.5)],
            )
        ]

        # 4. Create a 3-second dub WAV
        dub_wav = tmp_path / "dub.wav"
        create_synthetic_audio(dub_wav, duration_s=3.0)

        # 5. Render
        output_mp4 = tmp_path / "rendered_output.mp4"
        render_final_video(
            video_path=video_path,
            output_path=output_mp4,
            ass_path=ass_path,
            blur_regions=blur_regions,
            dub_wav_path=dub_wav,
            orig_audio="duck",
            video_width=640,
            video_height=360,
            duration=3.0,
            blur_strength=20,
        )

        assert output_mp4.exists()
        assert output_mp4.stat().st_size > 1000

        # 6. Verify with ffprobe
        meta = probe_video(output_mp4)
        assert meta["has_audio"] is True
        assert meta["duration"] == pytest.approx(3.0, 0.5)
        assert meta["width"] == 640
        assert meta["height"] == 360
        assert meta["codec"] == "h264"
