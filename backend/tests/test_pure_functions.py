"""Unit tests for pure functions in ZhViSub pipeline:
1. OCR box merging & interval calculation
2. Cue splitting & line wrapping
3. SRT & ASS subtitle generation
4. FFmpeg filtergraph building & progress parsing
5. TTS text normalization
6. Dubbing budget calculation
7. Dub timeline assembly
"""

import math
import os
import tempfile
import wave
from pathlib import Path

import numpy as np
import pytest

from app.pipeline.dub import (
    compute_budgets,
    build_dub_timeline_wav,
    normalize_text_for_tts,
    int_to_vietnamese_words,
    DubClip,
)
from app.pipeline.ocr import (
    compute_blur_intervals,
    merge_boxes,
    _boxes_overlap,
    _is_static_box,
    BBox,
    BlurRegion,
)
from app.pipeline.render import (
    build_blur_filtergraph,
    parse_ffmpeg_time_progress,
)
from app.pipeline.subtitle import (
    _wrap_text,
    generate_ass,
    generate_srt,
    split_long_cue,
)


# ============================================================
# 1. OCR Pure Functions
# ============================================================

class TestOCRPureFunctions:
    def test_boxes_overlap(self):
        b1 = (100, 100, 200, 50)
        b2 = (110, 105, 190, 45)  # largely overlapping
        assert _boxes_overlap(b1, b2, threshold=0.5) is True

        b3 = (500, 500, 50, 50)  # far away
        assert _boxes_overlap(b1, b3, threshold=0.1) is False

    def test_merge_boxes_consecutive_frames(self):
        # Frame 0 and Frame 1 have overlapping subtitle boxes
        boxes_by_frame = {
            0: [(100, 600, 400, 60)],
            1: [(102, 602, 398, 58)],
        }
        merged = merge_boxes(boxes_by_frame)
        assert len(merged) == 1
        x, y, w, h = merged[0]
        # Should have even coordinates and dimensions
        assert x % 2 == 0
        assert y % 2 == 0
        assert w % 2 == 0
        assert h % 2 == 0
        # Should include padding (~10%)
        assert w >= 400

    def test_merge_boxes_discards_single_frame_noise(self):
        # A box appearing in only one frame should not be treated as a stable region
        boxes_by_frame = {
            0: [(50, 50, 100, 30)],  # only frame 0
            2: [(200, 200, 100, 30)],  # not consecutive (0 and 2)
        }
        merged = merge_boxes(boxes_by_frame)
        assert len(merged) == 0

    def test_compute_blur_intervals_merging(self):
        # Detections at 1.0s, 1.4s, 3.0s
        detections = [
            (1.0, (100, 600, 200, 50)),
            (1.4, (100, 600, 200, 50)),
            (3.0, (100, 600, 200, 50)),
        ]
        # pre_pad = 0.3, post_pad = 0.3, merge_gap = 0.5
        # Detection 1: [0.7, 1.3]
        # Detection 2: [1.1, 1.7] -> overlaps with 1 -> [0.7, 1.7]
        # Detection 3: [2.7, 3.3] -> gap 2.7 - 1.7 = 1.0 > 0.5 -> separate
        intervals = compute_blur_intervals(detections, pre_pad=0.3, post_pad=0.3, merge_gap=0.5)
        assert len(intervals) == 2
        assert intervals[0][0] == pytest.approx(0.7, 0.05)
        assert intervals[0][1] == pytest.approx(1.7, 0.05)
        assert intervals[1][0] == pytest.approx(2.7, 0.05)
        assert intervals[1][1] == pytest.approx(3.3, 0.05)

    def test_is_static_box_watermark_detection(self):
        # A box that appears identically in 9 out of 10 frames
        logo = (10, 10, 80, 40)
        frames = [[logo] for _ in range(9)] + [[]]
        assert _is_static_box(logo, frames, static_threshold=0.8) is True

        # A subtitle box that only appears in 2 frames out of 10
        sub = (100, 600, 300, 50)
        frames_sub = [[sub], [sub]] + [[] for _ in range(8)]
        assert _is_static_box(sub, frames_sub, static_threshold=0.8) is False


# ============================================================
# 2. Cue Splitting & Subtitle Formatting
# ============================================================

class TestSubtitleFormatting:
    def test_wrap_text_short(self):
        short = "Xin chào các bạn"
        assert _wrap_text(short, max_chars=42) == short

    def test_wrap_text_long(self):
        text = "Đây là một câu rất dài dùng để kiểm tra việc tự động ngắt dòng của phụ đề thành hai dòng riêng biệt."
        wrapped = _wrap_text(text, max_chars=42)
        lines = wrapped.split("\n")
        assert len(lines) == 2
        for line in lines:
            assert len(line) <= 60  # close to max_chars with natural word break

    def test_split_long_cue_time_distribution(self):
        # Very long sentence (>84 chars)
        long_sentence = (
            "Chào mừng bạn đến với kênh của tôi hôm nay chúng ta sẽ tìm hiểu về cách làm việc của pipeline "
            "dịch video tự động từ tiếng Trung sang tiếng Việt một cách chính xác nhất."
        )
        cues = split_long_cue(long_sentence, start=10.0, end=20.0, max_chars=84)
        assert len(cues) >= 2

        # Check that cues partition the time range smoothly
        prev_end = 10.0
        for text, c_start, c_end in cues:
            assert c_start >= prev_end - 0.001
            assert c_end > c_start
            prev_end = c_end
        assert cues[-1][2] == pytest.approx(20.0, 0.01)

    def test_generate_srt(self, tmp_path):
        segments = [
            {"id": 1, "start": 1.0, "end": 3.5, "zh": "你好", "vi": "Xin chào"},
            {"id": 2, "start": 4.0, "end": 6.2, "zh": "再见", "vi": "Tạm biệt"},
        ]
        srt_file = tmp_path / "test.srt"
        generate_srt(segments, srt_file, text_key="vi")

        content = srt_file.read_text(encoding="utf-8")
        assert "00:00:01,000 --> 00:00:03,500" in content
        assert "Xin chào" in content
        assert "00:00:04,000 --> 00:00:06,200" in content
        assert "Tạm biệt" in content

    def test_generate_ass(self, tmp_path):
        segments = [
            {"id": 1, "start": 1.25, "end": 3.75, "vi": "Đoạn văn thử nghiệm ASS"},
        ]
        ass_file = tmp_path / "test.ass"
        generate_ass(
            segments=segments,
            output_path=ass_file,
            video_width=1280,
            video_height=720,
            font_name="Roboto",
        )
        content = ass_file.read_text(encoding="utf-8-sig")
        assert "PlayResX: 1280" in content
        assert "PlayResY: 720" in content
        assert "Style: Default,Roboto," in content
        assert "Dialogue: 0,0:00:01.25,0:00:03.75,Default" in content
        assert "Đoạn văn thử nghiệm ASS" in content


# ============================================================
# 3. FFmpeg Filtergraph & Progress Parsing
# ============================================================

class TestFFmpegFiltergraph:
    def test_build_blur_filtergraph(self):
        reg = BlurRegion(
            bbox=BBox(x=100, y=600, w=300, h=60),
            intervals=[(1.0, 3.5), (5.0, 7.2)],
        )
        lines, out_tag = build_blur_filtergraph([reg], video_width=1920, video_height=1080, blur_strength=25)
        assert len(lines) == 3
        # First line splits
        assert "split=2" in lines[0]
        # Second line crops and blurs
        assert "crop=300:60:100:600,gblur=sigma=25" in lines[1]
        # Third line overlays with enable expression
        assert "overlay=100:600" in lines[2]
        assert "between(t,1.000,3.500)+between(t,5.000,7.200)" in lines[2]
        assert out_tag == "[b_out_0]"

    def test_parse_ffmpeg_time_progress(self):
        # Form 1: out_time_ms=15000000 (15 seconds)
        line1 = "out_time_ms=15000000\n"
        frac1 = parse_ffmpeg_time_progress(line1, duration=30.0)
        assert frac1 == pytest.approx(0.5, 0.001)

        # Form 2: out_time=00:00:10.500000
        line2 = "out_time=00:00:10.500000"
        frac2 = parse_ffmpeg_time_progress(line2, duration=21.0)
        assert frac2 == pytest.approx(0.5, 0.001)

        # Non-matching line
        line3 = "speed=1.5x"
        assert parse_ffmpeg_time_progress(line3, duration=30.0) is None


# ============================================================
# 4. TTS Text Normalization
# ============================================================

class TestTTSNormalization:
    def test_integer_conversion(self):
        assert int_to_vietnamese_words(0) == "không"
        assert int_to_vietnamese_words(5) == "năm"
        assert int_to_vietnamese_words(15) == "mười lăm"
        assert int_to_vietnamese_words(21) == "hai mươi mốt"
        assert int_to_vietnamese_words(104) == "một trăm lẻ bốn"
        assert int_to_vietnamese_words(2024) == "hai nghìn không trăm hai mươi tư"

    def test_percentages(self):
        res = normalize_text_for_tts("Tỷ lệ tăng trưởng đạt 50% trong năm nay.")
        assert "năm mươi phần trăm" in res

        res_dec = normalize_text_for_tts("Lạm phát giảm 3.5% so với kỳ trước.")
        assert "ba phẩy năm phần trăm" in res_dec

    def test_units(self):
        res = normalize_text_for_tts("Vận tốc là 100km/h và quãng đường dài 25km.")
        assert "ki-lô-mét trên giờ" in res
        assert "ki-lô-mét" in res

        res_weight = normalize_text_for_tts("Gói hàng nặng 5kg.")
        assert "năm ki-lô-gam" in res_weight


# ============================================================
# 5. Dubbing Budget & Speed Calculation
# ============================================================

class TestDubbingBudget:
    def test_compute_budgets_with_gap(self):
        segments = [
            {"id": 1, "start": 0.0, "end": 2.0, "vi": "Câu thứ nhất"},
            # gap is 3.0 - 2.0 = 1.0s. Buffer is 80ms (0.08s).
            # Max spill is 400ms (0.4s). So spill = 0.4s. Budget = 2.0 + 0.4 = 2.4s.
            {"id": 2, "start": 3.0, "end": 5.0, "vi": "Câu thứ hai"},
        ]
        clips = compute_budgets(segments, video_duration=10.0, max_spill_ms=400)
        assert len(clips) == 2
        assert clips[0].budget == pytest.approx(2.4, 0.01)

    def test_compute_budgets_tight_gap(self):
        segments = [
            {"id": 1, "start": 0.0, "end": 2.0, "vi": "Câu một"},
            # gap is 2.1 - 2.0 = 0.1s. Buffer is 0.08s. Available spill = 0.02s < 0.4s.
            {"id": 2, "start": 2.1, "end": 4.0, "vi": "Câu hai"},
        ]
        clips = compute_budgets(segments, video_duration=10.0, max_spill_ms=400)
        assert clips[0].budget == pytest.approx(2.02, 0.01)
        # Never exceeds start of next sentence (2.0 + 0.02 = 2.02 < 2.1)
        assert clips[0].start + clips[0].budget <= clips[1].start

    def test_last_segment_budget_to_end_of_video(self):
        segments = [
            {"id": 1, "start": 8.0, "end": 9.2, "vi": "Câu cuối cùng"},
        ]
        # video duration = 10.0s. gap to end = 0.8s. max_spill_ms = 400ms = 0.4s.
        clips = compute_budgets(segments, video_duration=10.0, max_spill_ms=400)
        assert clips[0].budget == pytest.approx(1.6, 0.01)


# ============================================================
# 6. Dub Timeline Assembly
# ============================================================

class TestDubTimelineAssembly:
    def test_build_dub_timeline_wav(self, tmp_path):
        sample_rate = 48000
        video_duration = 3.0

        # Create two small synthetic WAV clips
        clip1_path = tmp_path / "clip1.wav"
        clip2_path = tmp_path / "clip2.wav"

        # Clip 1: 0.5s tone
        t1 = np.linspace(0, 0.5, int(0.5 * sample_rate), False)
        data1 = (0.5 * np.sin(2 * np.pi * 440 * t1) * 32767).astype(np.int16)
        with wave.open(str(clip1_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(data1.tobytes())

        # Clip 2: 0.5s tone
        t2 = np.linspace(0, 0.5, int(0.5 * sample_rate), False)
        data2 = (0.5 * np.sin(2 * np.pi * 880 * t2) * 32767).astype(np.int16)
        with wave.open(str(clip2_path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(data2.tobytes())

        clips = [
            DubClip(segment_id=1, start=0.2, end=0.7, budget=0.6, text="a", audio_path=clip1_path, duration=0.5),
            DubClip(segment_id=2, start=1.5, end=2.0, budget=0.6, text="b", audio_path=clip2_path, duration=0.5),
        ]

        output_wav = tmp_path / "dub_master.wav"
        build_dub_timeline_wav(clips, video_duration, output_wav, sample_rate=sample_rate)

        assert output_wav.exists()
        with wave.open(str(output_wav), "rb") as wf:
            assert wf.getframerate() == 48000
            assert wf.getnchannels() == 1
            total_frames = wf.getnframes()
            dur = total_frames / 48000.0
            # Exactly equals video duration
            assert dur == pytest.approx(video_duration, 0.001)
