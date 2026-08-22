import os
import httpx
import logging

logger = logging.getLogger(__name__)

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"

async def translate_text(text: str, source_language_code: str, target_language_code: str) -> str:
    """
    Translates text using the Sarvam AI API.
    Language codes should be like 'hi-IN', 'en-IN', 'mr-IN', 'pa-IN', etc.
    """
    if not text:
        return ""
    
    if source_language_code == target_language_code:
        return text

    if not SARVAM_API_KEY:
        logger.warning("SARVAM_API_KEY is not set. Skipping translation.")
        return text

    payload = {
        "input": text,
        "source_language_code": source_language_code,
        "target_language_code": target_language_code,
        "speaker_gender": "Male",
        "mode": "formal",
        "model": "sarvam-1"
    }

    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                SARVAM_TRANSLATE_URL,
                json=payload,
                headers=headers,
                timeout=15.0
            )
            response.raise_for_status()
            result = response.json()
            translated_text = result.get("translated_text", text)
            return translated_text
    except Exception as e:
        logger.error(f"Error during Sarvam translation: {e}")
        return text
