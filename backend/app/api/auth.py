"""Authentication router for Google OAuth 2.0 (Web and Native) and user session management."""

import uuid
import logging
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.crypto import create_access_token, decode_access_token, encrypt_text, mask_key, decrypt_text
from app.db.models import UserModel
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleAuthRequest(BaseModel):
    code: str
    redirect_uri: Optional[str] = None


class GoogleNativeAuthRequest(BaseModel):
    server_auth_code: Optional[str] = None
    id_token: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    has_google_token: bool = False
    has_api_key: bool = False
    api_provider: str = "gemini"
    masked_key: str = ""
    api_base_url: Optional[str] = None


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileResponse


async def get_google_user_access_token(user: UserModel) -> Optional[str]:
    """Retrieve a fresh Google OAuth access token for Gemini API using the stored encrypted refresh token."""
    if not user.google_refresh_token_enc:
        return None
    refresh_token = decrypt_text(user.google_refresh_token_enc)
    if not refresh_token:
        return None

    client_id = settings.google_client_id.strip()
    client_secret = settings.google_client_secret.strip()
    if not client_id or not client_secret:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
            if token_res.status_code == 200:
                data = token_res.json()
                return data.get("access_token")
            logger.warning("Failed to refresh Google access token: %s", token_res.text)
    except Exception as exc:
        logger.error("Error refreshing Google access token: %s", exc)
    return None


def get_google_user_access_token_sync(user: UserModel) -> Optional[str]:
    """Retrieve a fresh Google OAuth access token for Gemini API synchronously."""
    if not user.google_refresh_token_enc:
        return None
    refresh_token = decrypt_text(user.google_refresh_token_enc)
    if not refresh_token:
        return None

    client_id = settings.google_client_id.strip()
    client_secret = settings.google_client_secret.strip()
    if not client_id or not client_secret:
        return None

    try:
        with httpx.Client(timeout=10.0) as client:
            token_res = client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
            if token_res.status_code == 200:
                data = token_res.json()
                return data.get("access_token")
            logger.warning("Failed to refresh Google access token synchronously: %s", token_res.text)
    except Exception as exc:
        logger.error("Error refreshing Google access token synchronously: %s", exc)
    return None


def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Optional[UserModel]:
    """Extract authenticated user if Authorization Bearer header is present and valid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    user_id = payload["sub"]
    return db.query(UserModel).filter(UserModel.id == user_id).first()


def get_current_user_required(
    user: Optional[UserModel] = Depends(get_current_user_optional),
) -> UserModel:
    """Dependency that requires an authenticated user."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu đăng nhập để thực hiện hành động này",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


@router.get("/google/config")
def get_google_config():
    """Return public Google OAuth client ID and scopes for native mobile login."""
    return {
        "client_id": settings.google_client_id.strip(),
        "scopes": [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/generative-language",
        ],
    }


@router.get("/google/url")
def get_google_auth_url(redirect_uri: Optional[str] = None):
    """Return the Google OAuth 2.0 authorization URL for web redirect fallback."""
    client_id = settings.google_client_id.strip()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GOOGLE_CLIENT_ID chưa được cấu hình trên server.",
        )

    target_redirect = redirect_uri or settings.google_redirect_uri
    params = {
        "client_id": client_id,
        "redirect_uri": target_redirect,
        "response_type": "code",
        "scope": "openid email profile https://www.googleapis.com/auth/generative-language",
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return {"url": url}


@router.post("/google", response_model=AuthTokenResponse)
async def exchange_google_code(
    payload: GoogleAuthRequest,
    db: Session = Depends(get_db),
):
    """Exchange authorization code with Google for web OAuth flow, retrieve profile, and issue JWT."""
    client_id = settings.google_client_id.strip()
    client_secret = settings.google_client_secret.strip()

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth chưa được cấu hình (thiếu CLIENT_ID hoặc CLIENT_SECRET).",
        )

    redirect_uri = payload.redirect_uri or settings.google_redirect_uri

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": payload.code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )

        if token_res.status_code != 200:
            logger.error("Google token exchange failed: %s", token_res.text)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Xác thực Google thất bại: {token_res.text}",
            )

        token_data = token_res.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")

        # Fetch profile
        profile_res = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

        if profile_res.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể tải thông tin hồ sơ Google.",
            )

        profile = profile_res.json()
        google_sub = profile.get("sub")
        email = profile.get("email")
        name = profile.get("name", "")
        picture = profile.get("picture", "")

        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tài khoản Google không cung cấp địa chỉ email.",
            )

        # Find or create user
        user = db.query(UserModel).filter(
            (UserModel.google_sub == google_sub) | (UserModel.email == email)
        ).first()

        if not user:
            user = UserModel(
                id=str(uuid.uuid4()),
                email=email,
                name=name,
                picture=picture,
                google_sub=google_sub,
            )
            db.add(user)
        else:
            user.name = name
            user.picture = picture
            user.google_sub = google_sub

        if refresh_token:
            user.google_refresh_token_enc = encrypt_text(refresh_token)

        db.commit()
        db.refresh(user)

        # Issue JWT
        jwt_token = create_access_token({"sub": user.id, "email": user.email, "name": user.name})
        plain_key = decrypt_text(user.api_key_enc) if user.api_key_enc else ""

        return AuthTokenResponse(
            access_token=jwt_token,
            user=UserProfileResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                picture=user.picture,
                has_google_token=bool(user.google_refresh_token_enc),
                has_api_key=bool(user.api_key_enc),
                api_provider=user.api_provider or "gemini",
                masked_key=mask_key(plain_key),
                api_base_url=user.api_base_url,
            ),
        )


@router.post("/google/native", response_model=AuthTokenResponse)
async def login_google_native(
    payload: GoogleNativeAuthRequest,
    db: Session = Depends(get_db),
):
    """
    Exchange Android Credential Manager / Google Sign-In serverAuthCode or id_token
    for Google tokens, verify profile, store encrypted refresh token for Gemini, and issue JWT.
    """
    client_id = settings.google_client_id.strip()
    client_secret = settings.google_client_secret.strip()

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth chưa được cấu hình trên server (thiếu GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET trong .env).",
        )

    if not payload.server_auth_code and not payload.id_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu server_auth_code hoặc id_token từ Google Sign-In.",
        )

    google_sub = None
    email = None
    name = ""
    picture = ""
    refresh_token = None

    exchange_error_detail = ""
    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. If server_auth_code is present, exchange for tokens (including refresh token)
        if payload.server_auth_code:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "grant_type": "authorization_code",
                    "code": payload.server_auth_code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": "",  # Standard for Android native offline code exchange
                },
            )

            # Retry without redirect_uri if Google rejects with redirect_uri mismatch
            if token_res.status_code != 200 and "redirect_uri" in token_res.text:
                token_res = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "grant_type": "authorization_code",
                        "code": payload.server_auth_code,
                        "client_id": client_id,
                        "client_secret": client_secret,
                    },
                )

            if token_res.status_code == 200:
                token_data = token_res.json()
                access_token = token_data.get("access_token")
                refresh_token = token_data.get("refresh_token")

                if access_token:
                    profile_res = await client.get(
                        "https://www.googleapis.com/oauth2/v3/userinfo",
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                    if profile_res.status_code == 200:
                        profile = profile_res.json()
                        google_sub = profile.get("sub")
                        email = profile.get("email")
                        name = profile.get("name", "")
                        picture = profile.get("picture", "")
            else:
                logger.warning("Google native token exchange returned %s: %s", token_res.status_code, token_res.text)
                try:
                    err_json = token_res.json()
                    exchange_error_detail = err_json.get("error_description") or err_json.get("error") or ""
                except Exception:
                    exchange_error_detail = token_res.text[:120]

        # 2. Fallback to verify id_token if profile not retrieved from server_auth_code
        if not email and payload.id_token:
            tokeninfo_res = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.id_token}"
            )
            if tokeninfo_res.status_code == 200:
                t_info = tokeninfo_res.json()
                google_sub = t_info.get("sub")
                email = t_info.get("email")
                name = t_info.get("name", "")
                picture = t_info.get("picture", "")

    if not email:
        error_msg = "Không thể xác thực thông tin tài khoản Google từ thiết bị."
        if exchange_error_detail:
            error_msg += f" Chi tiết: {exchange_error_detail}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg,
        )

    # Find or create user
    user = db.query(UserModel).filter(
        (UserModel.google_sub == google_sub) | (UserModel.email == email)
    ).first()

    if not user:
        user = UserModel(
            id=str(uuid.uuid4()),
            email=email,
            name=name,
            picture=picture,
            google_sub=google_sub,
        )
        db.add(user)
    else:
        user.name = name or user.name
        user.picture = picture or user.picture
        user.google_sub = google_sub or user.google_sub

    if refresh_token:
        user.google_refresh_token_enc = encrypt_text(refresh_token)

    db.commit()
    db.refresh(user)

    # Issue JWT
    jwt_token = create_access_token({"sub": user.id, "email": user.email, "name": user.name})
    plain_key = decrypt_text(user.api_key_enc) if user.api_key_enc else ""

    return AuthTokenResponse(
        access_token=jwt_token,
        user=UserProfileResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            picture=user.picture,
            has_google_token=bool(user.google_refresh_token_enc),
            has_api_key=bool(user.api_key_enc),
            api_provider=user.api_provider or "gemini",
            masked_key=mask_key(plain_key),
            api_base_url=user.api_base_url,
        ),
    )


@router.get("/me", response_model=UserProfileResponse)
def get_current_user_profile(
    user: UserModel = Depends(get_current_user_required),
):
    """Return profile and AI connection status for currently logged in user."""
    plain_key = decrypt_text(user.api_key_enc) if user.api_key_enc else ""
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        has_google_token=bool(user.google_refresh_token_enc),
        has_api_key=bool(user.api_key_enc),
        api_provider=user.api_provider or "gemini",
        masked_key=mask_key(plain_key),
        api_base_url=user.api_base_url,
    )


@router.post("/google/disconnect")
def disconnect_google(
    user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Disconnect Google Gemini access token from user account."""
    user.google_refresh_token_enc = None
    db.commit()
    return {"message": "Đã ngắt kết nối tài khoản Google thành công."}


@router.post("/logout")
def logout():
    """Client clears local token."""
    return {"message": "Đã đăng xuất thành công."}
