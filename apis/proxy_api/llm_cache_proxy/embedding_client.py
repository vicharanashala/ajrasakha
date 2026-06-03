"""
Async client to get embeddings from the hosted embedding API.
"""
import httpx
from typing import List

from config import EMBEDDING_API_URL, logger


async def get_embedding(text: str) -> List[float]:
    """
    Call the embedding API and return the embedding vector.
    
    POST http://<host>:6001/embed
    Body: {"text": "..."}
    Response: {"embedding": [float, ...]}
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            logger.info(f"[EMBED] Calling {EMBEDDING_API_URL} with text='{text[:60]}'")
            response = await client.post(
                EMBEDDING_API_URL,
                json={"text": text},
            )
            logger.info(f"[EMBED] Response status={response.status_code}, content-type={response.headers.get('content-type', '?')}")
            response.raise_for_status()
            
            raw_body = response.text
            logger.info(f"[EMBED] Raw response body (first 300 chars): {raw_body[:300]}")
            
            data = response.json()
            logger.info(f"[EMBED] Parsed JSON keys: {list(data.keys())}")
            
            if "embedding" not in data:
                logger.error(f"[EMBED] Missing 'embedding' key! Available keys: {list(data.keys())}")
                raise ValueError(f"Unexpected response format: keys={list(data.keys())}")
            
            embedding = data["embedding"]
            logger.info(f"[EMBED] Success: dim={len(embedding)}, first_3={embedding[:3]}")
            return embedding
    except Exception as e:
        logger.error(f"[EMBED] FAILED — type={type(e).__name__}, error='{e}'")
        raise
