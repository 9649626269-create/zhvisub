#!/data/data/com.termux/files/usr/bin/env python3
"""ZhViSub Command-Line Interface (CLI) for Phase 1 testing and pipeline execution."""

import argparse
import os
import sys
import time
from pathlib import Path

# Add backend to sys.path so app modules are resolvable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import settings
from app.errors import AppError
from app.pipeline.pipeline import PipelineOptions, run_pipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ZhViSub: Tự động dịch video tiếng Trung sang tiếng Việt, làm mờ phụ đề cứng và lồng tiếng.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("video", help="Đường dẫn file video hoặc link http/https")
    parser.add_argument("-o", "--output-dir", default=None, help="Thư mục xuất file kết quả")

    # Subtitle & Blur options
    parser.add_argument("--no-blur", action="store_true", help="Tắt tính năng làm mờ phụ đề cứng gốc")
    parser.add_argument("--blur-strength", type=int, default=30, help="Độ mờ Gaussian blur (sigma)")
    parser.add_argument("--font-size", type=int, default=0, help="Cỡ chữ phụ đề (0 = tự động theo video)")
    parser.add_argument("--font", default="Noto Sans", help="Tên font chữ phụ đề")
    parser.add_argument("--color", default="&H00FFFFFF", help="Màu chữ ASS (&H00BBGGRR)")
    parser.add_argument("--position", choices=["bottom", "top"], default="bottom", help="Vị trí phụ đề")

    # Dubbing options
    parser.add_argument("--dub", action="store_true", help="Bật lồng tiếng Việt")
    parser.add_argument("--voice", default=settings.tts_voice, help="Tên giọng đọc TTS")
    parser.add_argument("--dub-rate", default="+0%", help="Tốc độ giọng đọc cơ sở (vd: +0%%, +10%%)")
    parser.add_argument(
        "--orig-audio",
        choices=["duck", "mute", "keep"],
        default="duck",
        help="Xử lý âm thanh gốc: duck (giảm 15dB), mute (tắt), keep (giữ nguyên)",
    )
    parser.add_argument(
        "--mock-ai",
        action="store_true",
        default=os.getenv("MOCK_AI", "0") in ("1", "true", "True"),
        help="Chế độ giả lập mô hình AI (ASR, OCR, LLM, TTS) để kiểm thử pipeline nhanh",
    )

    return parser.parse_args()


def progress_printer(step: str, fraction: float, message: str):
    percent = int(fraction * 100)
    bar_len = 25
    filled = int(bar_len * fraction)
    bar = "=" * filled + "-" * (bar_len - filled)
    print(f"\r[{bar}] {percent:3d}% | {message:<60}", end="", flush=True)
    if fraction >= 1.0 or step == "done":
        print()


def main():
    args = parse_args()

    # Determine output directory
    if args.output_dir:
        out_dir = Path(args.output_dir)
    else:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        out_dir = settings.data_dir / "output" / f"run_{timestamp}"

    out_dir.mkdir(parents=True, exist_ok=True)

    options = PipelineOptions(
        blur=not args.no_blur,
        blur_strength=args.blur_strength,
        font_size=args.font_size,
        font_name=args.font,
        color=args.color,
        position=args.position,
        dub=args.dub,
        voice=args.voice,
        dub_rate=args.dub_rate,
        orig_audio=args.orig_audio,
    )

    print("=" * 70)
    print(" ZhViSub — Pipeline dịch video tiếng Trung sang tiếng Việt")
    print("=" * 70)
    print(f"Video nguồn: {args.video}")
    print(f"Thư mục lưu: {out_dir.resolve()}")
    print(f"Làm mờ phụ đề cứng: {'BẬT' if options.blur else 'TẮT'}")
    print(f"Lồng tiếng Việt:    {'BẬT' if options.dub else 'TẮT'}")
    if options.dub:
        print(f"Giọng đọc:          {options.voice}")
        print(f"Âm thanh gốc:       {options.orig_audio}")
    print("-" * 70)

    try:
        start_time = time.time()

        if args.mock_ai:
            from contextlib import ExitStack
            from unittest.mock import patch
            import subprocess
            from app.pipeline.asr import Segment
            from app.pipeline.ocr import BBox, BlurRegion, OCRResult

            print("⚡ Chế độ Mock AI: Sử dụng dữ liệu ASR/OCR/Dịch mẫu + FFmpeg thật.")

            def _mock_transcribe(audio_path, progress_callback=None, cancel_check=None):
                if progress_callback:
                    progress_callback(1.0, "ASR (Mock): Đã nhận diện 2 câu mẫu")
                return [
                    Segment(id=1, start=0.5, end=2.2, text="你好，欢迎来到ZhViSub自动化视频翻译系统。"),
                    Segment(id=2, start=2.5, end=4.2, text="今天我们将演示完整的视频处理流程。"),
                ]

            def _mock_detect_hardsubs(video_path, video_width, video_height, progress_callback=None, cancel_check=None):
                if progress_callback:
                    progress_callback(1.0, "OCR (Mock): Phát hiện 1 vùng phụ đề cứng ở đáy video")
                by = int(video_height * 0.8)
                bh = int(video_height * 0.12)
                return OCRResult(
                    regions=[
                        BlurRegion(
                            bbox=BBox(x=int(video_width * 0.1), y=by, w=int(video_width * 0.8), h=bh),
                            intervals=[(0.5, 4.5)],
                        )
                    ],
                    has_hardsub=True,
                )

            def _mock_translate(segs, progress_callback=None, cancel_check=None):
                tr_map = {
                    1: "Xin chào, chào mừng bạn đến với hệ thống dịch video tự động ZhViSub.",
                    2: "Hôm nay chúng ta sẽ thử nghiệm toàn bộ quy trình xử lý video.",
                }
                for s in segs:
                    s["vi"] = tr_map.get(s["id"], "Bản dịch tiếng Việt mẫu")
                if progress_callback:
                    progress_callback(1.0, "Dịch (Mock): Đã dịch xong 2 câu")
                return segs

            def _mock_tts_single(text, output_path, voice=None, rate="+0%"):
                output_path.parent.mkdir(parents=True, exist_ok=True)
                subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-f", "lavfi", "-i", "sine=frequency=440:duration=1.4",
                        "-ar", "16000", "-ac", "1",
                        str(output_path),
                    ],
                    capture_output=True,
                )
                return output_path

            stack = ExitStack()
            stack.enter_context(patch("app.pipeline.pipeline.transcribe", side_effect=_mock_transcribe))
            stack.enter_context(patch("app.pipeline.pipeline.detect_hardsubs", side_effect=_mock_detect_hardsubs))
            stack.enter_context(patch("app.pipeline.pipeline.translate_segments", side_effect=_mock_translate))
            stack.enter_context(patch("app.pipeline.dub.synthesize_tts_single", side_effect=_mock_tts_single))
        else:
            from contextlib import nullcontext
            stack = nullcontext()

        with stack:
            result = run_pipeline(
                video_source=args.video,
                output_dir=out_dir,
                options=options,
                progress_callback=progress_printer,
            )
        elapsed = time.time() - start_time

        print("\n" + "=" * 70)
        print(f"🎉 Hoàn thành xuất sắc sau {elapsed:.1f} giây!")
        print("Các file kết quả:")
        print(f"  ▶ Video MP4:         {result.output_mp4.resolve()}")
        print(f"  ▶ Phụ đề Tiếng Việt: {result.srt_vi_path.resolve()}")
        print(f"  ▶ Phụ đề Tiếng Trung:{result.srt_zh_path.resolve()}")
        if result.dub_wav_path and result.dub_wav_path.exists():
            print(f"  ▶ File lồng tiếng:   {result.dub_wav_path.resolve()}")
        print("=" * 70)

    except AppError as e:
        print(f"\n❌ Lỗi ứng dụng [{e.code}]: {e.message}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️ Người dùng đã huỷ tiến trình.", file=sys.stderr)
        from app.pipeline.render import kill_all_active_renders
        kill_all_active_renders()
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Lỗi không xác định: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(2)


if __name__ == "__main__":
    main()
