"""Settings router for AI API Key management (Gemini, OpenAI, Anthropic, Custom)."""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user_optional, get_current_user_required
from app.crypto import decrypt_text, encrypt_text, mask_key
from app.db.models import UserModel
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


class ApiKeyUpdateRequest(BaseModel):
    provider: str = "gemini"  # gemini | openai | anthropic | custom
    key: str
    base_url: Optional[str] = None


class ApiKeyStatusResponse(BaseModel):
    has_key: bool
    provider: str
    masked_key: str
    base_url: Optional[str] = None


class ApiKeyTestRequest(BaseModel):
    provider: str = "gemini"
    key: Optional[str] = None
    base_url: Optional[str] = None


class ApiKeyTestResponse(BaseModel):
    valid: bool
    message: str


async def verify_provider_key(provider: str, key: str, base_url: Optional[str] = None) -> tuple[bool, str]:
    """Test validity of an API key against provider's API."""
    provider = provider.lower().strip()
    key = key.strip()

    if not key:
        return False, "Khoá API không được để trống."

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if provider == "gemini":
                # Check Gemini models endpoint
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
                res = await client.get(url)
                if res.status_code == 200:
                    return True, "Khoá Gemini API hợp lệ và hoạt động tốt!"
                else:
                    err_msg = res.json().get("error", {}).get("message", res.text)
                    return False, f"Khoá Gemini không hợp lệ: {err_msg}"

            elif provider == "openai":
                # Check OpenAI models endpoint
                url = f"{base_url.rstrip('/')}/models" if base_url else "https://api.openai.com/v1/models"
                res = await client.get(url, headers={"Authorization": f"Bearer {key}"})
                if res.status_code == 200:
                    return True, "Khoá OpenAI API hợp lệ và hoạt động tốt!"
                else:
                    return False, f"Khoá OpenAI không hợp lệ (HTTP {res.status_code})"

            elif provider == "anthropic":
                # Check Anthropic models endpoint
                url = "https://api.anthropic.com/v1/models"
                res = await client.get(
                    url,
                    headers={
                        "x-api-key": key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                if res.status_code == 200:
                    return True, "Khoá Anthropic API hợp lệ và hoạt động tốt!"
                else:
                    return False, f"Khoá Anthropic không hợp lệ (HTTP {res.status_code})"

            elif provider == "custom":
                if not base_url:
                    return False, "Thiếu địa chỉ Base URL cho provider tuỳ chỉnh."
                url = f"{base_url.rstrip('/')}/models"
                res = await client.get(url, headers={"Authorization": f"Bearer {key}"})
                if res.status_code == 200:
                    return True, "Kết nối Custom Base URL thành công!"
                else:
                    return False, f"Không thể kết nối API Custom (HTTP {res.status_code})"

            else:
                return False, f"Nhà cung cấp '{provider}' không được hỗ trợ."

    except httpx.TimeoutException:
        return False, "Kiểm tra API key quá thời gian (Timeout). Vui lòng thử lại."
    except Exception as e:
        return False, f"Lỗi kết nối khi kiểm tra key: {str(e)}"


@router.get("/api-key", response_model=ApiKeyStatusResponse)
def get_api_key_status(
    user: Optional[UserModel] = Depends(get_current_user_optional),
):
    """Return status of user's saved API key (masked)."""
    if not user or not user.api_key_enc:
        return ApiKeyStatusResponse(
            has_key=False,
            provider="gemini",
            masked_key="",
            base_url=None,
        )

    plain_key = decrypt_text(user.api_key_enc)
    return ApiKeyStatusResponse(
        has_key=bool(plain_key),
        provider=user.api_provider or "gemini",
        masked_key=mask_key(plain_key),
        base_url=user.api_base_url,
    )


@router.put("/api-key", response_model=ApiKeyStatusResponse)
def save_api_key(
    req: ApiKeyUpdateRequest,
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Encrypt and save a custom AI API key for authenticated user."""
    raw_key = req.key.strip()
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Khoá API không được để trống.",
        )

    user.api_provider = req.provider.lower().strip()
    user.api_key_enc = encrypt_text(raw_key)
    user.api_base_url = req.base_url.strip() if req.base_url else None

    db.commit()
    db.refresh(user)

    return ApiKeyStatusResponse(
        has_key=True,
        provider=user.api_provider,
        masked_key=mask_key(raw_key),
        base_url=user.api_base_url,
    )


@router.delete("/api-key")
def delete_api_key(
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Delete saved API key from user account."""
    user.api_key_enc = None
    user.api_base_url = None
    db.commit()
    return {"message": "Đã xoá khoá API thành công."}


@router.post("/api-key/test", response_model=ApiKeyTestResponse)
async def test_api_key(
    req: ApiKeyTestRequest,
    user: Optional[UserModel] = Depends(get_current_user_optional),
):
    """Test validity of an API key (passed directly or retrieved from user session)."""
    target_key = req.key
    target_base_url = req.base_url
    target_provider = req.provider

    if not target_key and user and user.api_key_enc:
        target_key = decrypt_text(user.api_key_enc)
        target_base_url = user.api_base_url
        target_provider = user.api_provider or target_provider

    if not target_key:
        return ApiKeyTestResponse(
            valid=False,
            message="Chưa có khoá API để kiểm tra.",
        )

    is_valid, msg = await verify_provider_key(
        provider=target_provider,
        key=target_key,
        base_url=target_base_url,
    )
    return ApiKeyTestResponse(valid=is_valid, message=msg)
