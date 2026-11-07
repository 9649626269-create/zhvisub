#!/data/data/com.termux/files/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "======================================================================"
echo " ZhViSub Smoke Test — Kiểm thử end-to-end Pipeline"
echo "======================================================================"

VIDEO_INPUT="$1"

IS_SYNTHETIC=0
if [ -z "$VIDEO_INPUT" ]; then
    IS_SYNTHETIC=1
    echo "⚠️ Không có video nào được truyền vào. Đang tạo video mẫu thử nghiệm..."
    SAMPLE_DIR="$BACKEND_DIR/data/sample"
    mkdir -p "$SAMPLE_DIR"
    VIDEO_INPUT="$SAMPLE_DIR/sample_test.mp4"

    # Create 5-second test video if not exists
    if [ ! -f "$VIDEO_INPUT" ]; then
        echo "Tạo video 640x360 5s với testsrc và sine audio..."
        ffmpeg -y \
            -f lavfi -i "testsrc=duration=5:size=640x360:rate=24" \
            -f lavfi -i "sine=frequency=880:duration=5" \
            -c:v libx264 -pix_fmt yuv420p \
            -c:a aac -b:a 128k \
            "$VIDEO_INPUT"
        echo "Đã tạo video mẫu tại: $VIDEO_INPUT"
    fi
fi

OUTPUT_DIR="$BACKEND_DIR/data/smoke_test_output_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "Video đầu vào: $VIDEO_INPUT"
echo "Thư mục xuất:  $OUTPUT_DIR"
echo "----------------------------------------------------------------------"

EXTRA_ARGS=("${@:2}")
if [ "$IS_SYNTHETIC" = "1" ] && [ ${#EXTRA_ARGS[@]} -eq 0 ]; then
    EXTRA_ARGS=("--mock-ai" "--dub")
fi

# Run cli.py
PYTHONPATH="$BACKEND_DIR" python3 "$BACKEND_DIR/cli.py" "$VIDEO_INPUT" -o "$OUTPUT_DIR" "${EXTRA_ARGS[@]}"

echo "----------------------------------------------------------------------"
echo "Kiểm tra các file đầu ra:"

MP4_FILE="$OUTPUT_DIR/output.mp4"
VI_SRT="$OUTPUT_DIR/vi.srt"
ZH_SRT="$OUTPUT_DIR/zh.srt"

if [ -f "$MP4_FILE" ] && [ -s "$MP4_FILE" ]; then
    echo "  [OK] Video MP4 tồn tại và hợp lệ: $(ls -lh "$MP4_FILE" | awk '{print $5}')"
else
    echo "  [FAIL] Không tìm thấy file video MP4!"
    exit 1
fi

if [ -f "$VI_SRT" ]; then
    echo "  [OK] Phụ đề Tiếng Việt (.srt) tồn tại: $(wc -l < "$VI_SRT") dòng"
else
    echo "  [FAIL] Không tìm thấy file vi.srt!"
    exit 1
fi

if [ -f "$ZH_SRT" ]; then
    echo "  [OK] Phụ đề Tiếng Trung (.srt) tồn tại: $(wc -l < "$ZH_SRT") dòng"
else
    echo "  [FAIL] Không tìm thấy file zh.srt!"
    exit 1
fi

echo "Kiểm tra tính hợp lệ của video xuất ra bằng ffprobe..."
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height "$MP4_FILE"

echo "======================================================================"
echo " Smoke test hoàn thành thành công!"
echo "======================================================================"
