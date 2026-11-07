"""Translation module: zh -> vi using LLM with fallback."""

import json
import logging
import time
from typing import Callable, Optional

from app.config import settings
from app.errors import AppError, ErrorCode

logger = logging.getLogger(__name__)

# NLLB model cache
_nllb_model = None
_nllb_tokenizer = None


def _translate_batch_llm(
    segments: list[dict],
    context_before: list[dict] | None = None,
    context_after: list[dict] | None = None,
    glossary: dict[str, str] | None = None,
    retry_count: int = 0,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """
    Translate a batch of segments using OpenAI-compatible LLM.
    
    Args:
        segments: List of {"id": int, "zh": str}.
        context_before: 2-3 preceding segments for context.
        context_after: 2-3 following segments for context.
        glossary: Accumulated proper name translations.
        retry_count: Current retry attempt.
        api_key: Optional custom API key (user-provided or server default).
        base_url: Optional custom Base URL.
        model: Optional model name.
    
    Returns:
        List of {"id": int, "vi": str}.
    """
    from openai import OpenAI, APIError, RateLimitError

    target_key = api_key or settings.llm_api_key or "dummy"
    target_base = base_url or settings.llm_base_url
    target_model = model or settings.llm_model

    # If it's a Google Gemini API key or OAuth access token and no explicit custom base_url was set
    if (target_key.startswith("AIza") or target_key.startswith("ya29.")) and not base_url:
        target_base = "https://generativelanguage.googleapis.com/v1beta/openai/"
        if not model or model == settings.llm_model or "gemini" not in model.lower():
            target_model = "gemini-1.5-flash"
        else:
            target_model = model
    
    client = OpenAI(
        base_url=target_base,
        api_key=target_key,
    )
    
    # Build context strings
    ctx_parts = []
    if context_before:
        ctx_parts.append("Ngữ cảnh trước:")
        for s in context_before:
            ctx_parts.append(f"  {s['id']}. {s['zh']}")
    if context_after:
        ctx_parts.append("Ngữ cảnh sau:")
        for s in context_after:
            ctx_parts.append(f"  {s['id']}. {s['zh']}")
    
    glossary_text = ""
    if glossary:
        glossary_text = "\n\nTừ điển tên riêng đã thống nhất:\n" + "\n".join(
            f"  {k} → {v}" for k, v in glossary.items()
        )
    
    context_text = "\n".join(ctx_parts) if ctx_parts else ""
    
    input_json = json.dumps(
        [{"id": s["id"], "zh": s["zh"]} for s in segments],
        ensure_ascii=False,
    )
    
    system_prompt = (
        "Bạn là dịch giả chuyên nghiệp Trung-Việt. Dịch phụ đề từ tiếng Trung sang tiếng Việt "
        "tự nhiên, dễ hiểu, giữ nguyên ý nghĩa. Thống nhất cách dịch tên riêng xuyên suốt.\n"
        "Trả về CHÍNH XÁC JSON array: [{\"id\": <number>, \"vi\": \"<bản dịch>\"}]\n"
        "Chỉ trả JSON, không giải thích thêm."
        f"{glossary_text}"
    )
    
    user_prompt = f"{context_text}\n\nDịch các câu sau:\n{input_json}" if context_text else f"Dịch các câu sau:\n{input_json}"
    
    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=target_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=4096,
            )
            
            content = response.choices[0].message.content.strip()
            
            # Try to parse JSON from response
            # Handle cases where LLM wraps in markdown code blocks
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if len(lines) > 2 else content
            
            result = json.loads(content)
            
            # Validate: check all IDs are present
            expected_ids = {s["id"] for s in segments}
            result_ids = {r["id"] for r in result}
            
            if expected_ids != result_ids:
                if attempt < max_retries:
                    logger.warning(
                        "LLM response ID mismatch (attempt %d): expected %s, got %s",
                        attempt + 1, expected_ids, result_ids,
                    )
                    continue
                else:
                    logger.error("LLM response ID mismatch after %d retries", max_retries)
                    return None  # Signal fallback needed
            
            return result
            
        except (json.JSONDecodeError, KeyError, TypeError, IndexError) as e:
            if attempt < max_retries:
                logger.warning("LLM parse error (attempt %d): %s", attempt + 1, e)
                continue
            logger.error("LLM parse failed after %d retries: %s", max_retries, e)
            return None
            
        except RateLimitError:
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)
                logger.warning("LLM rate limited, waiting %ds...", wait)
                time.sleep(wait)
                continue
            raise AppError(ErrorCode.LLM_QUOTA_EXCEEDED)
            
        except APIError as e:
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)
                logger.warning("LLM API error (attempt %d): %s, retrying in %ds", attempt + 1, e, wait)
                time.sleep(wait)
                continue
            raise AppError(ErrorCode.LLM_ERROR, f"Lỗi API dịch thuật: {e}")
    
    return None


def _translate_nllb(text: str) -> str:
    """Translate a single text using NLLB-200 (offline fallback)."""
    global _nllb_model, _nllb_tokenizer
    
    if _nllb_model is None:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        
        model_name = "facebook/nllb-200-distilled-600M"
        cache_dir = str(settings.models_dir / "nllb")
        
        logger.info("Loading NLLB model: %s", model_name)
        _nllb_tokenizer = AutoTokenizer.from_pretrained(
            model_name, cache_dir=cache_dir
        )
        _nllb_model = AutoModelForSeq2SeqLM.from_pretrained(
            model_name, cache_dir=cache_dir
        )
        logger.info("NLLB model loaded.")
    
    _nllb_tokenizer.src_lang = "zho_Hans"
    inputs = _nllb_tokenizer(text, return_tensors="pt", max_length=512, truncation=True)
    
    translated = _nllb_model.generate(
        **inputs,
        forced_bos_token_id=_nllb_tokenizer.convert_tokens_to_ids("vie_Latn"),
        max_new_tokens=512,
    )
    
    return _nllb_tokenizer.decode(translated[0], skip_special_tokens=True)


def _translate_google(text: str) -> str:
    """Translate using Google Cloud Translation API."""
    import httpx
    
    api_key = settings.llm_api_key  # Reuse or add separate GOOGLE_API_KEY
    if not api_key:
        raise AppError(ErrorCode.TRANSLATE_ERROR, "Google Translation API key chưa được cấu hình.")
    
    url = "https://translation.googleapis.com/language/translate/v2"
    response = httpx.post(
        url,
        params={"key": api_key},
        json={"q": text, "source": "zh", "target": "vi", "format": "text"},
        timeout=30,
    )
    
    if response.status_code != 200:
        raise AppError(ErrorCode.TRANSLATE_ERROR, f"Google Translate lỗi: {response.status_code}")
    
    data = response.json()
    return data["data"]["translations"][0]["translatedText"]


def _fallback_translate(text: str) -> str:
    """Use configured fallback translation method."""
    if settings.translate_fallback == "google":
        return _translate_google(text)
    else:
        return _translate_nllb(text)


def translate_segments(
    segments: list[dict],
    batch_size: int = 20,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
) -> list[dict]:
    """
    Translate all segments from Chinese to Vietnamese.
    
    Args:
        segments: List of {"id": int, "start": float, "end": float, "zh": str}.
        batch_size: Number of segments per LLM batch.
        progress_callback: Called with (fraction 0-1, log_message).
        cancel_check: Returns True if job should be cancelled.
        api_key: Optional custom API key.
        base_url: Optional custom Base URL.
        model: Optional model name.
    
    Returns:
        Same list with added "vi" field.
    """
    total = len(segments)
    if total == 0:
        return segments
    
    logger.info("Translating %d segments", total)
    
    # Accumulated glossary for proper name consistency
    glossary: dict[str, str] = {}
    translated_count = 0
    
    for batch_start in range(0, total, batch_size):
        if cancel_check and cancel_check():
            raise AppError(ErrorCode.JOB_CANCELLED)
        
        batch_end = min(batch_start + batch_size, total)
        batch = segments[batch_start:batch_end]
        
        # Context: 2-3 segments before and after
        ctx_before = segments[max(0, batch_start - 3):batch_start]
        ctx_after = segments[batch_end:min(batch_end + 3, total)]
        
        # Try LLM first
        result = _translate_batch_llm(
            batch, ctx_before, ctx_after, glossary,
            api_key=api_key, base_url=base_url, model=model,
        )
        
        if result is not None:
            # Apply translations
            result_map = {r["id"]: r["vi"] for r in result}
            for seg in batch:
                vi_text = result_map.get(seg["id"], "")
                seg["vi"] = vi_text
                
                # Update glossary: look for proper nouns (simplified heuristic)
                # Names that start with uppercase or are repeated
                # This is a basic approach; the LLM naturally handles this
            
            translated_count += len(batch)
        else:
            # Fallback: translate each segment individually
            logger.warning("Falling back to %s translation for batch", settings.translate_fallback)
            for seg in batch:
                if cancel_check and cancel_check():
                    raise AppError(ErrorCode.JOB_CANCELLED)
                try:
                    seg["vi"] = _fallback_translate(seg["zh"])
                except AppError:
                    raise
                except Exception as e:
                    logger.error("Fallback translation failed for segment %d: %s", seg["id"], e)
                    raise AppError(
                        ErrorCode.TRANSLATE_ERROR,
                        f"Lỗi dịch phụ đề câu {seg['id']}: {e}",
                    )
                translated_count += 1
        
        if progress_callback:
            progress_callback(
                translated_count / total,
                f"Dịch: {translated_count}/{total} câu",
            )
    
    logger.info("Translation complete: %d segments", total)
    return segments
