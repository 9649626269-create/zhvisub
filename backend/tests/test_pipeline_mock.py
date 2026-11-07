"""End-to-end pipeline test with mocked AI models (ASR, OCR, LLM, TTS).
Uses real FFmpeg for audio extraction, atempo, and final video rendering.
"""

from pathlib import Path
from unittest.mock import patch

import pytest

from app.pipeline.asr import Segment
from app.pipeline.audio import probe_video
from app.pipeline.ocr import BBox, BlurRegion, OCRResult
from app.pipeline.pipeline import PipelineOptions, run_pipeline
from tests.test_ffmpeg_real import create_synthetic_audio, create_synthetic_video


class TestPipelineMock:
    def test_pipeline_end_to_end_without_dub(self, tmp_path):
        video_src = tmp_path / "input.mp4"
        create_synthetic_video(video_src, duration_s=3, width=640, height=360)

        out_dir = tmp_path / "job_out_no_dub"

        # Mock ASR
        mock_segments = [
            Segment(id=1, start=0.5, end=2.5, text="你好世界"),
        ]

        # Mock OCR
        mock_ocr = OCRResult(
            regions=[
                BlurRegion(
                    bbox=BBox(x=50, y=280, w=540, h=50),
                    intervals=[(0.5, 2.5)],
                )
            ],
            has_hardsub=True,
        )

        def mock_translate(segs, progress_callback=None, cancel_check=None):
            for s in segs:
                s["vi"] = "Xin chào thế giới"
            return segs

        with patch("app.pipeline.pipeline.transcribe", return_value=mock_segments), \
             patch("app.pipeline.pipeline.detect_hardsubs", return_value=mock_ocr), \
             patch("app.pipeline.pipeline.translate_segments", side_effect=mock_translate):

            progress_events = []

            def on_progress(step, frac, msg):
                progress_events.append((step, frac, msg))

            options = PipelineOptions(blur=True, dub=False)
            res = run_pipeline(
                video_source=video_src,
                output_dir=out_dir,
                options=options,
                progress_callback=on_progress,
            )

            # 1. Output files exist
            assert res.output_mp4.exists()
            assert res.srt_vi_path.exists()
            assert res.srt_zh_path.exists()
            assert res.dub_wav_path is None

            # 2. Subtitle contents
            vi_content = res.srt_vi_path.read_text(encoding="utf-8")
            assert "Xin chào thế giới" in vi_content
            zh_content = res.srt_zh_path.read_text(encoding="utf-8")
            assert "你好世界" in zh_content

            # 3. Output video is valid
            meta = probe_video(res.output_mp4)
            assert meta["has_audio"] is True
            assert meta["width"] == 640
            assert meta["height"] == 360
            assert meta["codec"] == "h264"

            # 4. Progress events fired
            steps_fired = {e[0] for e in progress_events}
            assert "ingest" in steps_fired
            assert "asr" in steps_fired
            assert "ocr" in steps_fired
            assert "translate" in steps_fired
            assert "render" in steps_fired
            assert "done" in steps_fired

    def test_pipeline_end_to_end_with_dub(self, tmp_path):
        video_src = tmp_path / "input_dub.mp4"
        create_synthetic_video(video_src, duration_s=4, width=640, height=360)

        out_dir = tmp_path / "job_out_with_dub"

        mock_segments = [
            Segment(id=1, start=0.5, end=2.0, text="第一句话"),
            Segment(id=2, start=2.2, end=3.5, text="第二句话"),
        ]

        def mock_translate(segs, progress_callback=None, cancel_check=None):
            translations = ["Câu thứ nhất", "Câu thứ hai"]
            for i, s in enumerate(segs):
                s["vi"] = translations[i]
            return segs

        # Mock synthesize_tts_single to create real sine wave
        def mock_tts_synth(text, output_path, voice=None, rate="+0%"):
            create_synthetic_audio(output_path, duration_s=1.0)
            return output_path

        with patch("app.pipeline.pipeline.transcribe", return_value=mock_segments), \
             patch("app.pipeline.pipeline.detect_hardsubs", return_value=OCRResult(regions=[], has_hardsub=False)), \
             patch("app.pipeline.pipeline.translate_segments", side_effect=mock_translate), \
             patch("app.pipeline.dub.synthesize_tts_single", side_effect=mock_tts_synth):

            options = PipelineOptions(blur=False, dub=True, orig_audio="duck")
            res = run_pipeline(
                video_source=video_src,
                output_dir=out_dir,
                options=options,
            )

            assert res.output_mp4.exists()
            assert res.srt_vi_path.exists()
            assert res.srt_zh_path.exists()
            assert res.dub_wav_path is not None
            assert res.dub_wav_path.exists()

            # Verify dub.wav
            meta_video = probe_video(res.output_mp4)
            assert meta_video["has_audio"] is True
            assert meta_video["duration"] == pytest.approx(4.0, 0.5)
