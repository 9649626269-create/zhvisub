"""Local file storage with interface for future S3 migration."""

import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO

from app.config import settings


class StorageBackend(ABC):
    """Abstract storage interface."""

    @abstractmethod
    def save_stream(self, path: Path, stream: BinaryIO, chunk_size: int = 8192) -> int:
        """Save a stream to the given path. Returns bytes written."""
        ...

    @abstractmethod
    def read_bytes(self, path: Path) -> bytes:
        ...

    @abstractmethod
    def delete(self, path: Path) -> None:
        ...

    @abstractmethod
    def delete_dir(self, path: Path) -> None:
        ...

    @abstractmethod
    def exists(self, path: Path) -> bool:
        ...

    @abstractmethod
    def size(self, path: Path) -> int:
        ...

    @abstractmethod
    def total_usage_bytes(self) -> int:
        """Return total disk usage of the data directory."""
        ...


class LocalStorage(StorageBackend):
    """Store files on local disk."""

    def save_stream(self, path: Path, stream: BinaryIO, chunk_size: int = 8192) -> int:
        path.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        with open(path, "wb") as f:
            while True:
                chunk = stream.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                total += len(chunk)
        return total

    def read_bytes(self, path: Path) -> bytes:
        return path.read_bytes()

    def delete(self, path: Path) -> None:
        if path.exists():
            path.unlink(missing_ok=True)

    def delete_dir(self, path: Path) -> None:
        if path.exists() and path.is_dir():
            shutil.rmtree(path, ignore_errors=True)

    def exists(self, path: Path) -> bool:
        return path.exists()

    def size(self, path: Path) -> int:
        return path.stat().st_size if path.exists() else 0

    def total_usage_bytes(self) -> int:
        total = 0
        data_dir = settings.data_dir
        if data_dir.exists():
            for dirpath, _dirnames, filenames in os.walk(data_dir):
                for f in filenames:
                    fp = Path(dirpath) / f
                    try:
                        total += fp.stat().st_size
                    except OSError:
                        pass
        return total


storage = LocalStorage()
