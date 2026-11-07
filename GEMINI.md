# ZhViSub — Prompt hoàn chỉnh

*Bản gộp: prompt gốc + sửa lỗi thiết kế + lồng tiếng tự động. Dán nguyên văn các mục bên dưới cho AI/dev thực hiện.*

## Vai trò và mục tiêu

Bạn là senior full-stack engineer. Xây dựng ứng dụng “ZhViSub” (web + APK): tự động dịch video tiếng Trung sang tiếng Việt, làm mờ phụ đề cứng gốc, chèn phụ đề Việt và (tuỳ chọn) lồng tiếng Việt khớp thời lượng từng câu.

Giả định triển khai: một người dùng, không đăng nhập, chạy localhost/LAN (không mở cổng ra Internet). Video có thể ngang hoặc dọc (9:16).

## Cách làm việc

- Làm theo 4 pha. Mỗi pha kết thúc bằng tiêu chí xong rồi DỪNG, chờ tôi xác nhận mới sang pha sau:
  1. Backend pipeline (chạy bằng CLI, chia module độc lập để Celery task gọi lại ở pha 2). Xong khi: video mẫu ra mp4 + 2 file .srt.
  2. API + Celery + DB. Xong khi: đủ endpoint chạy được bằng curl; huỷ job, render lại, dọn file hoạt động.
  3. Web. Xong khi: đủ luồng upload → theo dõi → sửa phụ đề → render lại → tải về.
  4. Đóng gói APK (Capacitor). Xong khi: build được APK debug và gọi được API.
- Có công cụ ghi file/chạy lệnh thì ghi thẳng vào repo và chạy test; chỉ có chat thì mỗi file một code block kèm đường dẫn đầy đủ. Pha quá dài cho một lượt thì chia theo module và nói rõ đã/chưa gửi file nào.
- Code đầy đủ chạy được, không placeholder. Pin phiên bản mọi thư viện và nêu rõ. Giao diện và thông báo lỗi bằng tiếng Việt; tên biến và comment code bằng tiếng Anh.
- Không thêm tính năng ngoài danh sách trong prompt này (mục “Ngoài phạm vi” ở cuối).
- Thiếu thông tin nhỏ thì tự chọn giả định hợp lý và nêu ngắn gọn; chỉ hỏi khi thật cần.
- Cuối mỗi pha báo rõ phần ĐÃ CHẠY (kèm output thật) và CHƯA CHẠY. Không khẳng định đã kiểm thử khi chưa chạy.

## Kiến trúc

- Backend: Python 3.11, FastAPI, Celery + Redis (hàng đợi), FFmpeg (có libass), lưu file local qua interface `Storage` (có thể đổi sang S3). DB: SQLite chế độ WAL (volume dùng chung giữa api và worker) cho job, segment, lịch sử; đổi được sang Postgres qua `DATABASE_URL`.
- Web: Next.js + Tailwind, `output: 'export'` (static export; không SSR, API routes, middleware, dynamic route). Trang job dùng query (`/job?id=...`).
- APK: Capacitor bọc bản static export (mobile-first), gọi chung REST API. URL API cấu hình được trong màn Cài đặt (mặc định từ `NEXT_PUBLIC_API_URL`). API bật CORS (gồm origin của Capacitor Android); production dùng HTTPS, còn HTTP/LAN cần cấu hình cleartext + mixed content cho Android. Xử lý video chạy trên server, không chạy trên điện thoại.
- Docker Compose: `api`, `worker` (queue `main`: ASR, dịch, lồng tiếng, render), `worker-ocr` (queue `ocr`, image riêng để cô lập phụ thuộc CUDA/cuDNN giữa CTranslate2 và Paddle), `beat` (Celery beat), `redis`, `web` (build static rồi serve bằng nginx). Mặc định chạy CPU; `docker-compose.gpu.yml` bổ sung NVIDIA GPU. Volume: `data`, `models` (cache model), `db`.

## Pipeline xử lý

Mỗi bước cập nhật tiến độ % và log ngắn. Trọng số gợi ý: nhận video + tách audio 5%, ASR 25%, OCR 15%, dịch 15%, lồng tiếng 15%, render 25% (chia lại khi tắt lồng tiếng). Tiến độ ASR theo end-time segment, OCR theo số frame, dịch/TTS theo số câu, render theo `-progress` của FFmpeg.

1. **Nhận video**: upload (mp4/mov/mkv, tối đa 2GB) hoặc dán link trực tiếp. Upload ghi stream xuống đĩa theo chunk, không đọc vào RAM; kiểm tra bằng `ffprobe`. Link: chỉ http/https, chặn IP nội bộ/loopback/link-local (chống SSRF, kiểm tra cả sau redirect), có timeout, giới hạn dung lượng, kiểm tra MIME.
2. **Tách audio** bằng FFmpeg (16kHz mono WAV).
3. **ASR tiếng Trung**: faster-whisper, mặc định large-v3, `language=zh`, `vad_filter=True`, `condition_on_previous_text=False` (chống ảo giác khi im lặng/nhạc), `word_timestamps=True`. `WHISPER_MODEL` và `WHISPER_COMPUTE` (float16 trên GPU, int8 trên CPU) đặt qua env. Trả segment có timestamp; segment dài hơn 8s tách theo dấu câu. Không có giọng nói → lỗi `NO_SPEECH`.
4. **OCR phát hiện hard-sub**: lấy mẫu `OCR_FPS` (mặc định 2) khung hình/giây, PaddleOCR (`lang=ch`) chỉ trên 35% đáy khung (`OCR_BOTTOM_RATIO`). Lọc: conf ≥ 0.6; bỏ box tĩnh xuất hiện gần suốt video (logo/watermark); box phải xuất hiện ≥ 2 mẫu liên tiếp. Gộp box theo thời gian thành vùng ổn định (đệm thêm 10%, làm tròn toạ độ về số chẵn); khoảng hiện chữ = \[lần đầu thấy − 0.3s, lần cuối thấy + 0.3s\], gộp các khoảng hở ≤ 0.5s. Không có phụ đề cứng → bỏ qua làm mờ. Cho phép người dùng chỉnh tay vùng mờ (xem Giao diện và API). Mốc thời gian làm mờ lấy từ OCR; mốc thời gian phụ đề Việt và lồng tiếng lấy từ ASR.
5. **Dịch zh→vi**: LLM chuẩn OpenAI-compatible (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`), batch \~20 câu kèm 2–3 câu liền kề làm ngữ cảnh, văn phong tự nhiên, thống nhất tên riêng (glossary tích luỹ giữa các batch). Output bắt buộc là JSON `[{"id":1,"vi":"..."}]`; kiểm tra khớp đủ id, sai thì retry (tối đa 2 lần) rồi mới fallback. Fallback chọn qua `TRANSLATE_FALLBACK=nllb|google`: NLLB-200-distilled-600M (offline) hoặc Google Cloud Translation API (cần key); không dùng thư viện scrape. Hết quota/lỗi API → backoff, rồi fallback, rồi báo lỗi rõ ràng. Khi tạo .srt/.ass: mỗi cue tối đa 2 dòng, \~42 ký tự/dòng; câu dài hơn 84 ký tự tách thành nhiều cue, chia thời gian theo tỉ lệ ký tự (segment trong DB không đổi).
6. **Lồng tiếng** (khi `dub=true`): văn bản = `dub_text` nếu có, không thì `vi` (phụ đề Việt đã chỉnh); mốc thời gian = đoạn ASR gốc; dùng giọng TTS có sẵn.
   - Ngân sách mỗi câu = từ `start` đến `end` cộng phần khoảng lặng trước câu kế (chừa 80ms, tối đa `DUB_MAX_SPILL_MS`=400); không bao giờ vượt `start` câu kế (câu cuối: đến hết video).
   - Chuẩn hoá text cho TTS (số, %, đơn vị, viết tắt → chữ) bằng hàm thuần có unit test. TTS song song (tối đa `DUB_CONCURRENCY`=4), cache theo hash(text, voice, rate). Cắt lặng đầu/đuôi clip rồi đo thời lượng T; r = T / ngân sách.
   - r ≤ 1: giữ nguyên tốc độ (không kéo chậm để lấp chỗ trống), đặt tại `start`.
   - 1 < r ≤ `DUB_MAX_SPEEDUP` (mặc định 1.3): tăng tốc bằng FFmpeg `atempo`.
   - Vượt trần: LLM rút gọn thành `dub_text` (giữ nguyên `vi` cho phụ đề), TTS lại và áp lại quy tắc trên. Vẫn vượt → ép ở trần, cắt + fade-out 50ms, đánh dấu `overflow`. Không bao giờ chồng tiếng lên câu sau.
   - Dựng `dub.wav` 48kHz: đặt clip theo offset mẫu, chuẩn hoá âm lượng từng clip, fade 10ms, độ dài đúng bằng video. Trộn với âm gốc theo `orig_audio`: `duck` (mặc định, giảm \~15 dB khi có lồng tiếng) | `mute` | `keep`; thực hiện trong cùng lệnh FFmpeg ở bước 7.
   - Lưu mỗi câu `dub_speed` và `dub_status` (`ok` | `stretched` | `shortened` | `overflow`).
   - TTS: `TTS_PROVIDER=edge` (thư viện edge-tts, pin bản 7.3.x; cần internet, không phải API chính thức) với fallback `piper` (offline) khi lỗi/bị chặn. edge-tts không hỗ trợ SSML tuỳ chỉnh, chỉ chỉnh được `rate`/`volume`/`pitch`: dùng `rate` làm tốc độ cơ sở (`dub_rate`). Danh sách giọng vi-VN lấy từ provider qua `GET /voices`; mặc định `TTS_VOICE=vi-VN-HoaiMyNeural`.
7. **Render** bằng MỘT lệnh FFmpeg (làm mờ + chèn phụ đề + trộn audio), encode một lần: H.264 `yuv420p` + AAC, `-movflags +faststart`; xử lý rotation metadata, VFR, kích thước lẻ. Filtergraph ghi vào file script (tránh giới hạn độ dài dòng lệnh).
   - Làm mờ (chỉ khi có vùng): mỗi vùng dựng `split → crop → gblur → overlay`, đặt `enable='between(t,a,b)+between(t,c,d)+…'` trên `overlay` (không đặt `enable` trực tiếp trên bộ lọc blur vì sẽ làm mờ cả khung). Mức mờ theo tuỳ chọn, mặc định đủ để không đọc được chữ gốc. Làm mờ trước, burn-in phụ đề sau.
   - Phụ đề: file .ass có PlayResX/PlayResY bằng độ phân giải video, font Roboto/Noto Sans (cài sẵn trong image, truyền `fontsdir`), viền đen, nền mờ nhẹ, đặt đúng vị trí vùng đã làm mờ (hoặc vị trí người dùng chọn); burn-in bằng libass.
   - Audio: có lồng tiếng thì trộn như bước 6, không thì giữ âm gốc.
   - “Render lại” chỉ chạy lại bước 6 (chỉ các câu đã sửa) và bước 7, tái dùng kết quả ASR, OCR, dịch.
8. **Xuất**: video mp4 + `.srt` Việt + `.srt` Trung (+ `dub.wav` nếu có lồng tiếng).

## Giao diện (tiếng Việt, dark mode, mobile-first)

- **Trang chủ**: kéo thả/chọn video hoặc dán link (tiến độ upload bằng XHR). Tuỳ chọn: làm mờ bật/tắt, mức mờ, cỡ chữ, màu, vị trí, font (danh sách font đã cài); lồng tiếng bật/tắt, giọng, tốc độ cơ sở (0.8–1.2), âm gốc (giảm/tắt/giữ).
- **Trang job**: thanh tiến độ theo bước, log ngắn, nút huỷ job.
- **Trình chỉnh phụ đề**: danh sách câu (`zh | vi`), sửa trực tiếp (sửa zh không tự dịch lại: zh chỉ dùng cho .srt Trung, vi dùng để render). Xem trước phụ đề bằng overlay HTML trên `<video>` (không render ở server; mô phỏng vùng mờ bằng CSS). Khi có lồng tiếng: phát `dub.wav` bằng `<audio>` đồng bộ với `<video>` (muted). Mỗi câu hiện hệ số tốc độ và cảnh báo `shortened`/`overflow`. Chỉnh tay vùng mờ: vẽ một hoặc nhiều hình chữ nhật trên khung hình lấy từ server. Nút “Render lại”.
- **Lịch sử job**: danh sách, tải mp4/.srt Việt/.srt Trung/dub.wav, xoá file.

## API (REST, JSON; lỗi trả `{code, message}` bằng tiếng Việt; job ID là UUID4)

- `POST /jobs`: multipart (`file` hoặc `url`) + options (`blur`, `blur_strength`, `font_size`, `color`, `position`, `font`, `dub`, `voice`, `dub_rate`, `orig_audio`).
- `GET /jobs` (lịch sử, phân trang); `GET /jobs/{id}` (trạng thái, % theo bước, log ngắn, options, mã lỗi).
- `POST /jobs/{id}/cancel`; `DELETE /jobs/{id}` (xoá job và file).
- `GET /jobs/{id}/segments`; `PUT /jobs/{id}/segments` (mỗi segment: `id`, `start`, `end`, `zh`, `vi`, `dub_text`, `dub_speed`, `dub_status`).
- `POST /jobs/{id}/render`: options + `dub` + `blur_regions` chỉnh tay (`[{x,y,w,h}]`, toạ độ chuẩn hoá 0–1; thay vùng OCR, vẫn dùng khoảng thời gian OCR, không có thì áp dụng cả video).
- `GET /jobs/{id}/download?type=mp4|srt_vi|srt_zh|dub`.
- `GET /jobs/{id}/video` (video gốc, hỗ trợ HTTP Range để xem trước/tua); `GET /jobs/{id}/frame?t=` (JPEG một khung hình, để vẽ vùng mờ).
- `GET /voices`.

## Yêu cầu phi chức năng

- **Dọn file**: file tạm (wav 16k, frame, clip TTS trung gian) xoá ngay khi job xong/lỗi/huỷ; video gốc và output giữ `RETENTION_HOURS` (mặc định 24) rồi Celery beat xoá. Giới hạn dung lượng upload (`MAX_UPLOAD_GB`=2), số job đồng thời (`MAX_CONCURRENT_JOBS`), tổng dung lượng thư mục data.
- **Lỗi rõ ràng** (mã + thông điệp tiếng Việt): video hỏng, không có giọng nói, hết quota LLM/TTS, link không hợp lệ/bị chặn, vượt dung lượng, FFmpeg lỗi (kèm vài dòng cuối stderr trong log).
- **Huỷ job**: đặt cờ huỷ (kiểm tra giữa các bước/batch) và kill tiến trình FFmpeg đang chạy; không chỉ dựa vào `revoke`.
- **GPU (CUDA) tuỳ chọn**, tự phát hiện và fallback CPU. Worker GPU `concurrency=1`. Pin phiên bản CTranslate2, cuDNN, PaddlePaddle, PaddleOCR (PaddleOCR 2.x và 3.x khác API; dùng đúng API của bản đã pin). Image CPU và GPU tách biệt (hoặc build arg). Nạp model một lần mỗi worker process; model tải lần đầu (vài GB) và cache vào volume `models`.
- **Bảo mật**: upload stream, chống SSRF, job ID UUID4, CORS cấu hình qua `CORS_ORIGINS`.
- Không hardcode API key; dùng `.env` và cung cấp `.env.example` liệt kê mọi biến (`LLM_*`, `TRANSLATE_FALLBACK`, `WHISPER_*`, `OCR_*`, `TTS_*`, `DUB_*`, `RETENTION_HOURS`, `MAX_*`, `CORS_ORIGINS`, `DATABASE_URL`, `NEXT_PUBLIC_API_URL`).

## Kiểm thử

- Unit test (pytest) cho hàm thuần, không cần GPU/model: gộp box + lọc OCR, khoảng thời gian làm mờ, ngắt dòng/tách cue, sinh .srt/.ass, dựng filtergraph FFmpeg, parse tiến độ FFmpeg, chuẩn hoá text TTS, tính ngân sách + hệ số tốc độ, ghép timeline lồng tiếng (không chồng, đúng offset, dài bằng video).
- Mock ASR/OCR/LLM/TTS để test luồng pipeline.
- Với FFmpeg thật: clip sau `atempo` dài ≤ ngân sách ±50ms; mp4 xuất ra hợp lệ (`ffprobe`).
- Script `scripts/smoke_test.sh <video>` chạy end-to-end trên video tôi cung cấp.

## Đầu ra cuối cùng

- Cấu trúc thư mục và code đầy đủ.
- Lệnh chạy: `docker compose up` (GPU: `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up`).
- Build APK: `npm run build` (static export) → `npx cap add android` (lần đầu) → `npx cap sync android` → Gradle `./gradlew assembleDebug`; nêu rõ yêu cầu JDK/Android SDK và lệnh tạo keystore cho bản release.
- Cách test bằng một video mẫu.
- Danh sách phần chưa kiểm thử (ví dụ GPU, TTS thật cần internet, build APK).

## Ngoài phạm vi

Nhân bản giọng, nhiều người nói (diarization), tách giọng khỏi nhạc nền, làm chậm/kéo giãn video, đăng nhập/xác thực/đa người dùng, và mọi tính năng không nêu ở trên.
