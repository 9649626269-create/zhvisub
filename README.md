# ZhViSub — Tự Động Dịch & Lồng Tiếng Video Trung → Việt

Ứng dụng hoàn chỉnh (Backend Pipeline + REST API + Celery + Web Next.js + APK Capacitor) giúp:
1. Tự động nhận diện giọng nói tiếng Trung (**faster-whisper large-v3**, VAD).
2. Tự động phát hiện và làm mờ phụ đề cứng gốc (**PaddleOCR**).
3. Dịch sang tiếng Việt mượt mà theo ngữ cảnh (**OpenAI-compatible LLM / NLLB-200 / Google Translate**).
4. Lồng tiếng tự động khớp khẩu hình từng câu (**edge-tts / piper** với thuật toán ngân sách thời gian & FFmpeg atempo).
5. Render video xuất bản bằng **MỘT** lệnh FFmpeg encode tối ưu (H.264 + AAC + libass burn-in).

---

## 🏗️ Kiến Trúc Hệ Thống

```
zhvisub/
├── backend/                         # Backend Python 3.11, FastAPI, Celery
│   ├── .env.example                 # Mọi biến môi trường mẫu
│   ├── requirements.txt             # Pinned dependencies (API & Worker chính)
│   ├── requirements-ocr.txt         # Pinned dependencies (Worker OCR cách ly)
│   ├── cli.py                       # CLI chạy độc lập pipeline
│   ├── app/
│   │   ├── config.py                # Pydantic Settings
│   │   ├── errors.py                # Mã lỗi & thông điệp tiếng Việt
│   │   ├── storage.py               # Storage backend interface
│   │   ├── celery_app.py            # Celery app + Redis routing
│   │   ├── db/                      # SQLite WAL mode & SQLAlchemy models
│   │   ├── api/                     # REST API routers (Jobs, Voices, Video Streaming)
│   │   ├── tasks/                   # Celery tasks (Main pipeline, OCR, Retention cleanup)
│   │   └── pipeline/                # Các module xử lý video độc lập
│   └── tests/                       # 34 tests tự động (Pytest)
├── web/                             # Next.js 16 + Tailwind CSS (output: 'export')
│   ├── src/app/                     # Trang chủ (/), Theo dõi (/job), Lịch sử (/history), Cài đặt (/settings)
│   ├── src/lib/api.ts               # API Client hỗ trợ cấu hình động IP server
│   ├── capacitor.config.ts          # Cấu hình Capacitor mobile
│   └── android/                     # Native Android project đã cấu hình Cleartext & Permissions
├── docker/                          # Dockerfiles (API, Worker, Worker-OCR, Web Nginx)
├── docker-compose.yml               # Docker Compose đầy đủ (CPU)
├── docker-compose.gpu.yml           # NVIDIA GPU Overlay
└── scripts/
    ├── smoke_test.sh                # Test end-to-end trên video mẫu
    └── build_apk.sh                 # Đóng gói static export và build APK
```

---

## 🚀 Hướng Dẫn Khởi Chạy

### 1. Triển khai bằng Docker Compose (Khuyên dùng)

#### Chạy chế độ CPU:
```bash
docker compose up -d --build
```

#### Chạy với tăng tốc NVIDIA GPU (CUDA):
```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Sau khi khởi động:
- **Giao diện Web**: [http://localhost:3000](http://localhost:3000)
- **REST API & Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 2. Chạy Pipeline bằng CLI (Không cần Docker / Redis)

Để xử lý trực tiếp video qua dòng lệnh:
```bash
python3 backend/cli.py path/to/video.mp4 -o ./output --dub
```

Các tuỳ chọn CLI:
- `--no-blur`: Tắt tính năng làm mờ phụ đề cứng.
- `--blur-strength`: Độ mờ Gaussian (mặc định 30).
- `--dub`: Bật lồng tiếng Việt.
- `--voice`: Giọng đọc TTS (mặc định `vi-VN-HoaiMyNeural`).
- `--orig-audio`: Xử lý âm gốc (`duck` giảm 15dB, `mute` tắt, `keep` giữ nguyên).
- `--mock-ai`: Chạy thử nhanh với dữ liệu mẫu (sử dụng FFmpeg thật).

---

### 3. Kiểm Thử Hệ Thống (Tests)

Chạy bộ 34 automated unit & integration tests:
```bash
cd backend
PYTHONPATH=. pytest tests/ -v
```

Chạy script smoke test end-to-end:
```bash
./scripts/smoke_test.sh
```

---

## 📱 Đóng Gói Ứng Dụng Android (APK)

Ứng dụng web được thiết kế Mobile-First và được bọc native qua **Capacitor**:
1. Đảm bảo máy tính đã cài đặt **JDK 17 hoặc 21** và **Android SDK** (Android Studio).
2. Chạy script đóng gói tự động:
   ```bash
   ./scripts/build_apk.sh
   ```
3. File APK Debug xuất ra tại:
   `web/android/app/build/outputs/apk/debug/app-debug.apk`

### Tạo Keystore cho bản Release:
```bash
keytool -genkey -v -keystore web/android/app/zhvisub-release-key.jks \
  -alias zhvisub -keyalg RSA -keysize 2048 -validity 10000
```
Sau đó build release:
```bash
./scripts/build_apk.sh release
```
