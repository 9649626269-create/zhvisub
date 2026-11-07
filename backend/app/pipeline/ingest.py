"""Video ingestion: upload handling and URL download with SSRF protection."""

import ipaddress
import logging
import socket
from pathlib import Path
from typing import BinaryIO
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.errors import AppError, ErrorCode
from app.pipeline.audio import probe_video

logger = logging.getLogger(__name__)

ALLOWED_MIMES = {
    "video/mp4",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "video/x-msvideo",
    "application/octet-stream",
}

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi"}


def is_private_ip(ip_str: str) -> bool:
    """Check if an IP address string is private, loopback, link-local, or reserved."""
    try:
        ip = ipaddress.ip_address(ip_str)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        )
    except ValueError:
        return True


def resolve_and_check_ip(hostname: str) -> str:
    """Resolve hostname and check that no resolved IP is private/loopback/link-local."""
    try:
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        if not addr_info:
            raise AppError(ErrorCode.INVALID_URL, f"Không thể phân giải tên miền: {hostname}")
        for item in addr_info:
            ip = item[4][0]
            if is_private_ip(ip):
                raise AppError(
                    ErrorCode.SSRF_BLOCKED,
                    f"Link bị chặn do trỏ tới địa chỉ nội bộ ({ip}).",
                )
        return addr_info[0][4][0]
    except socket.gaierror:
        raise AppError(ErrorCode.INVALID_URL, f"Không thể phân giải tên miền: {hostname}")


def validate_video_url(url: str) -> str:
    """Validate video URL for HTTP/HTTPS scheme and anti-SSRF."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise AppError(ErrorCode.INVALID_URL, "Địa chỉ URL không hợp lệ.")

    if parsed.scheme.lower() not in ("http", "https"):
        raise AppError(ErrorCode.INVALID_URL, "Chỉ hỗ trợ giao thức http hoặc https.")

    hostname = parsed.hostname
    if not hostname:
        raise AppError(ErrorCode.INVALID_URL, "URL thiếu hostname.")

    resolve_and_check_ip(hostname)
    return url


def download_video(
    url: str,
    output_path: Path,
    max_bytes: int | None = None,
) -> Path:
    """
    Download video from URL with SSRF protection, size check, and ffprobe validation.
    """
    if max_bytes is None:
        max_bytes = int(settings.max_upload_gb * 1024 * 1024 * 1024)

    target_url = validate_video_url(url)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=httpx.Timeout(connect=15.0, read=60.0, write=15.0, pool=15.0),
            max_redirects=5,
        ) as client:
            with client.stream("GET", target_url) as response:
                if response.status_code != 200:
                    raise AppError(
                        ErrorCode.DOWNLOAD_FAILED,
                        f"Tải video thất bại, mã HTTP: {response.status_code}",
                    )

                # Validate redirect destination hostname
                final_hostname = urlparse(str(response.url)).hostname
                if final_hostname:
                    resolve_and_check_ip(final_hostname)

                # Validate content-type
                content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
                if content_type and content_type not in ALLOWED_MIMES:
                    raise AppError(
                        ErrorCode.INVALID_VIDEO,
                        f"Định dạng MIME không được hỗ trợ: {content_type}",
                    )

                content_len = response.headers.get("content-length")
                if content_len and int(content_len) > max_bytes:
                    raise AppError(ErrorCode.UPLOAD_TOO_LARGE, "Video vượt quá giới hạn dung lượng.")

                total_downloaded = 0
                with open(output_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=65536):
                        total_downloaded += len(chunk)
                        if total_downloaded > max_bytes:
                            output_path.unlink(missing_ok=True)
                            raise AppError(ErrorCode.UPLOAD_TOO_LARGE, "Video vượt quá giới hạn dung lượng.")
                        f.write(chunk)

    except (httpx.RequestError, httpx.TimeoutException) as exc:
        output_path.unlink(missing_ok=True)
        raise AppError(ErrorCode.DOWNLOAD_FAILED, f"Lỗi kết nối tải video: {exc}")

    # Validate with ffprobe
    try:
        probe_video(output_path)
    except Exception as exc:
        output_path.unlink(missing_ok=True)
        raise AppError(ErrorCode.INVALID_VIDEO, f"Video tải về không hợp lệ: {exc}")

    return output_path


def save_upload_stream(
    stream: BinaryIO,
    filename: str,
    output_path: Path,
    max_bytes: int | None = None,
) -> Path:
    """Save an uploaded file stream chunk by chunk without loading into memory."""
    if max_bytes is None:
        max_bytes = int(settings.max_upload_gb * 1024 * 1024 * 1024)

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AppError(
            ErrorCode.INVALID_VIDEO,
            f"Định dạng file không được hỗ trợ ({ext}). Chỉ chấp nhận: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    total_written = 0

    with open(output_path, "wb") as f:
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            total_written += len(chunk)
            if total_written > max_bytes:
                output_path.unlink(missing_ok=True)
                raise AppError(ErrorCode.UPLOAD_TOO_LARGE, "File tải lên vượt quá dung lượng cho phép.")
            f.write(chunk)

    if total_written == 0:
        output_path.unlink(missing_ok=True)
        raise AppError(ErrorCode.INVALID_VIDEO, "File tải lên rỗng.")

    # Validate with ffprobe
    try:
        probe_video(output_path)
    except Exception as exc:
        output_path.unlink(missing_ok=True)
        raise AppError(ErrorCode.INVALID_VIDEO, f"File video không hợp lệ: {exc}")

    return output_path
