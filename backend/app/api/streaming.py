"""HTTP Range streaming helper for video playback and scrubbing."""

import os
from pathlib import Path
from typing import Generator
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse


def parse_byte_range(range_header: str, file_size: int) -> tuple[int, int]:
    """Parse HTTP Range header: 'bytes=start-end'."""
    if not range_header.startswith("bytes="):
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail="Header Range không hợp lệ.",
        )

    range_val = range_header.replace("bytes=", "").strip()
    parts = range_val.split("-")
    start_str = parts[0].strip()
    end_str = parts[1].strip() if len(parts) > 1 else ""

    if start_str and end_str:
        start = int(start_str)
        end = int(end_str)
    elif start_str:
        start = int(start_str)
        end = file_size - 1
    elif end_str:
        start = file_size - int(end_str)
        end = file_size - 1
    else:
        start = 0
        end = file_size - 1

    start = max(0, start)
    end = min(file_size - 1, end)

    if start > end or start >= file_size:
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail="Khoảng byte yêu cầu nằm ngoài dung lượng file.",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    return start, end


def stream_file_range(file_path: Path, start: int, end: int, chunk_size: int = 128 * 1024) -> Generator[bytes, None, None]:
    """Yield file byte chunks from start to end inclusive."""
    with open(file_path, "rb") as f:
        f.seek(start)
        bytes_to_read = end - start + 1
        while bytes_to_read > 0:
            current_chunk = min(chunk_size, bytes_to_read)
            data = f.read(current_chunk)
            if not data:
                break
            bytes_to_read -= len(data)
            yield data


def range_streaming_response(file_path: Path, range_header: str | None, media_type: str = "video/mp4") -> StreamingResponse:
    """Return an HTTP 206 Partial Content or HTTP 200 StreamingResponse with Range support."""
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File video không tồn tại.")

    file_size = file_path.stat().st_size
    if not range_header:
        # Full file response
        def full_stream():
            with open(file_path, "rb") as f:
                while chunk := f.read(128 * 1024):
                    yield chunk

        return StreamingResponse(
            full_stream(),
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )

    start, end = parse_byte_range(range_header, file_size)
    content_length = end - start + 1

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
    }

    return StreamingResponse(
        stream_file_range(file_path, start, end),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        headers=headers,
        media_type=media_type,
    )
