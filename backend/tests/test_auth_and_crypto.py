"""Unit tests for AES crypto helpers, token generation, and settings endpoints."""

import pytest
from fastapi.testclient import TestClient

from app.crypto import create_access_token, decode_access_token, decrypt_text, encrypt_text, mask_key
from app.main import app

client = TestClient(app)


def test_crypto_encryption_and_decryption():
    secret = "AIzaSyD-sample-gemini-key-123456789"
    encrypted = encrypt_text(secret)
    assert encrypted != secret
    assert len(encrypted) > 20

    decrypted = decrypt_text(encrypted)
    assert decrypted == secret


def test_mask_key():
    assert mask_key("AIzaSyD123456789") == "AIza...6789"
    assert mask_key("sk-proj-abcde9999") == "sk-...9999"
    assert mask_key("short") == "sho...hort"
    assert mask_key("") == ""


def test_jwt_access_token():
    payload = {"sub": "user-uuid-123", "email": "test@example.com"}
    token = create_access_token(payload)
    assert token and isinstance(token, str)

    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == "user-uuid-123"
    assert decoded["email"] == "test@example.com"


def test_api_key_status_endpoint():
    res = client.get("/settings/api-key")
    assert res.status_code == 200
    data = res.json()
    assert "has_key" in data
    assert "provider" in data
    assert "masked_key" in data


def test_api_key_test_empty():
    res = client.post("/settings/api-key/test", json={"provider": "gemini", "key": ""})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is False
