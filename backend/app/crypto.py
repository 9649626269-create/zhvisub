"""Cryptographic helpers for API key encryption, masking, and JWT authentication."""

import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from cryptography.fernet import Fernet

from app.config import settings


def _get_fernet() -> Fernet:
    """Return a Fernet cipher instance using settings.encryption_key or derived from jwt_secret."""
    raw_key = settings.encryption_key.strip()
    if not raw_key:
        raw_key = settings.jwt_secret.strip() or "zhvisub-default-fallback-key-secret-seed"

    # Derive a 32-byte URL-safe base64 key using SHA-256
    digest = hashlib.sha256(raw_key.encode("utf-8")).digest()
    key_b64 = base64.urlsafe_b64encode(digest)
    return Fernet(key_b64)


def encrypt_text(plain: str) -> str:
    """Encrypt a plain text string (e.g., API key, refresh token) using AES-Fernet."""
    if not plain:
        return ""
    f = _get_fernet()
    encrypted_bytes = f.encrypt(plain.encode("utf-8"))
    return encrypted_bytes.decode("utf-8")


def decrypt_text(cipher_text: str) -> str:
    """Decrypt a cipher text string back to plain text."""
    if not cipher_text:
        return ""
    try:
        f = _get_fernet()
        decrypted_bytes = f.decrypt(cipher_text.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except Exception:
        return ""


def mask_key(key: str) -> str:
    """Mask an API key to show only the last 4 characters, e.g. 'sk-...1234' or 'AIza...7890'."""
    if not key:
        return ""
    key = key.strip()
    if len(key) <= 4:
        return "****"
    
    prefix = ""
    if key.startswith("sk-"):
        prefix = "sk-..."
    elif key.startswith("AIza"):
        prefix = "AIza..."
    else:
        prefix = key[:3] + "..."
        
    return f"{prefix}{key[-4:]}"


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token for user sessions."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    encoded_jwt = jwt.encode(
        to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Verify and decode a signed JWT access token."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except (jwt.PyJWTError, Exception):
        return None
