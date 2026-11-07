"""Application error codes and exceptions."""

from enum import Enum


class ErrorCode(str, Enum):
    """Error codes with Vietnamese messages."""
    INVALID_VIDEO = "INVALID_VIDEO"
    NO_SPEECH = "NO_SPEECH"
    UPLOAD_TOO_LARGE = "UPLOAD_TOO_LARGE"
    MAX_JOBS_REACHED = "MAX_JOBS_REACHED"
    INVALID_URL = "INVALID_URL"
    SSRF_BLOCKED = "SSRF_BLOCKED"
    DOWNLOAD_FAILED = "DOWNLOAD_FAILED"
    FFMPEG_ERROR = "FFMPEG_ERROR"
    LLM_ERROR = "LLM_ERROR"
    LLM_QUOTA_EXCEEDED = "LLM_QUOTA_EXCEEDED"
    TTS_ERROR = "TTS_ERROR"
    TTS_QUOTA_EXCEEDED = "TTS_QUOTA_EXCEEDED"
    JOB_NOT_FOUND = "JOB_NOT_FOUND"
    JOB_CANCELLED = "JOB_CANCELLED"
    TRANSLATE_ERROR = "TRANSLATE_ERROR"
    OCR_ERROR = "OCR_ERROR"
    RENDER_ERROR = "RENDER_ERROR"
    STORAGE_FULL = "STORAGE_FULL"


ERROR_MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.INVALID_VIDEO: "Video không hợp lệ hoặc bị hỏng.",
    ErrorCode.NO_SPEECH: "Không phát hiện giọng nói trong video.",
    ErrorCode.UPLOAD_TOO_LARGE: "File vượt quá giới hạn dung lượng cho phép.",
    ErrorCode.MAX_JOBS_REACHED: "Đã đạt giới hạn số công việc đồng thời.",
    ErrorCode.INVALID_URL: "Link không hợp lệ. Chỉ hỗ trợ http/https.",
    ErrorCode.SSRF_BLOCKED: "Link bị chặn vì trỏ đến địa chỉ nội bộ.",
    ErrorCode.DOWNLOAD_FAILED: "Không thể tải video từ link đã cung cấp.",
    ErrorCode.FFMPEG_ERROR: "Lỗi xử lý video (FFmpeg).",
    ErrorCode.LLM_ERROR: "Lỗi khi gọi API dịch thuật.",
    ErrorCode.LLM_QUOTA_EXCEEDED: "Đã hết quota API dịch thuật.",
    ErrorCode.TTS_ERROR: "Lỗi khi tạo giọng đọc.",
    ErrorCode.TTS_QUOTA_EXCEEDED: "Đã hết quota dịch vụ giọng đọc.",
    ErrorCode.JOB_NOT_FOUND: "Không tìm thấy công việc.",
    ErrorCode.JOB_CANCELLED: "Công việc đã bị huỷ.",
    ErrorCode.TRANSLATE_ERROR: "Lỗi khi dịch phụ đề.",
    ErrorCode.OCR_ERROR: "Lỗi khi nhận diện phụ đề cứng.",
    ErrorCode.RENDER_ERROR: "Lỗi khi render video.",
    ErrorCode.STORAGE_FULL: "Bộ nhớ đã đầy.",
}


class AppError(Exception):
    """Application-level error with code and Vietnamese message."""

    def __init__(self, code: ErrorCode, detail: str | None = None):
        self.code = code
        self.message = detail or ERROR_MESSAGES.get(code, str(code))
        super().__init__(self.message)

    def to_dict(self) -> dict:
        return {"code": self.code.value, "message": self.message}
