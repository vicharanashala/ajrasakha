from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pymongo import MongoClient
from bson import ObjectId
from sentence_transformers import SentenceTransformer
import json
import logging
import os
import time
import uvicorn
import difflib
import urllib.request
import urllib.error
import re
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("agri_search")

load_dotenv()

app = FastAPI(title="AgriAI Q&A Semantic Search")

# --- Reviewer DB (existing) ---
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "agriai")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "questions")
VECTOR_INDEX_NAME = os.getenv("VECTOR_INDEX_NAME", "vector_index")

# --- Golden + PoP DB ---
# Defaults chosen to match your MCP containers, but you should set these in env.
GOLDEN_MONGO_URI = os.getenv("GOLDEN_MONGO_URI") or MONGO_URI
GOLDEN_DB_NAME = os.getenv("GOLDEN_DB_NAME", "golden_db")
GOLDEN_QA_COLLECTION = os.getenv("GOLDEN_QA_COLLECTION", "agri_qa_latest")
GOLDEN_POP_COLLECTION = os.getenv("GOLDEN_POP_COLLECTION", "pop")
GOLDEN_VECTOR_INDEX_NAME = os.getenv("GOLDEN_VECTOR_INDEX_NAME", "vector_index")

# Embedding model used for the query vector. Must match the embedding dimensionality
# used when building your Atlas vector index.
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-large-en")

# LLM Endpoint for Agent Search and Sanitization
GEMMA_LLM_ENDPOINT = os.getenv("GEMMA_LLM_ENDPOINT", "http://100.100.108.44:8014/v1/chat/completions")

reviewer_client = MongoClient(MONGO_URI)
reviewer_collection = reviewer_client[DB_NAME][COLLECTION_NAME]
answers_collection = reviewer_client[DB_NAME]["answers"]
users_collection = reviewer_client[DB_NAME]["users"]

golden_client = MongoClient(GOLDEN_MONGO_URI)
golden_qa_collection = golden_client[GOLDEN_DB_NAME][GOLDEN_QA_COLLECTION]
golden_pop_collection = golden_client[GOLDEN_DB_NAME][GOLDEN_POP_COLLECTION]

model = SentenceTransformer(EMBEDDING_MODEL_NAME)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    threshold: float = 0.7
    mode: str = ""
    district: str | None = None
    state: str | None = None
    # not bypass crop / domain / season.
    crop: str | None = None
    domain: str | None = None
    season: str | None = None
    sanitized: bool = False


class QAItem(BaseModel):
    id: str
    question: str
    text: str | None = None
    answer: str | None = None
    details: dict
    status: str
    source: str
    score: float
    agri_expert: str | None = None
    sources: list | None = None


class GoldenQAMetadata(BaseModel):
    category: str | None = None
    year: str | None = None
    month: str | None = None
    day: str | None = None
    crop: str | None = None
    district: str | None = None
    block_name: str | None = None
    sector: str | None = None
    sector_a: str | None = None
    season: str | None = None
    query_type: str | None = None
    agri_specialist: str | None = None
    date: str | None = None
    source: str | None = None
    state: str | None = None


class GoldenQAItem(BaseModel):
    text: str
    question: str
    answer: str
    metadata: GoldenQAMetadata
    score: float


class PopItem(BaseModel):
    text: str
    metadata: dict
    score: float


class MultiSearchResponse(BaseModel):
    reviewer: list[QAItem]
    golden: list[GoldenQAItem]
    pop: list[PopItem] | None = None


# ---------------- Sanitization Pipeline ----------------

_VALID_STATES_CACHE = []
_VALID_CROPS_CACHE = []
_CACHE_INITIALIZED = False

def _ensure_cache():
    global _VALID_STATES_CACHE, _VALID_CROPS_CACHE, _CACHE_INITIALIZED
    if _CACHE_INITIALIZED:
        return
    raw_states = reviewer_collection.distinct("details.state", {"status": "closed"})
    raw_crops = reviewer_collection.distinct("details.crop", {"status": "closed"})
    _VALID_STATES_CACHE = sorted({str(s).strip() for s in raw_states if s and str(s).strip()})
    _VALID_CROPS_CACHE = sorted({str(c).strip() for c in raw_crops if c and str(c).strip()})
    _CACHE_INITIALIZED = True

def normalize_string(val: str) -> str:
    if not val:
        return ""
    return " ".join(val.strip().title().split())

def fuzzy_match(val: str, valid_list: list[str]) -> str | None:
    norm_val = normalize_string(val)
    norm_map = {normalize_string(v): v for v in valid_list}
    
    if norm_val in norm_map:
        return norm_map[norm_val]
        
    matches = difflib.get_close_matches(norm_val, norm_map.keys(), n=1, cutoff=0.7)
    if matches:
        return norm_map[matches[0]]
        
    return None

def llm_match(val: str, entity_type: str, valid_list: list[str]) -> str | None:
    prompt = f"""You are an expert mapping assistant.
Map the user's requested {entity_type} to the exact closest semantic match from the valid list below.
If there is no logical match, reply with exactly "NONE".

CRITICAL INSTRUCTIONS:
- You must reply with ONLY the exact match from the valid list.
- Do NOT output any reasoning, explanations, or conversational text.
- If you output anything other than the exact match or "NONE", the system will crash.

Valid options: {json.dumps(valid_list)}
User request: {val}
Exact match:"""
    
    payload = {
        "model": "google/gemma-4-E4B-it",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 100,
        "temperature": 0.0,
        "extra_body": {"chat_template_kwargs": {"enable_thinking": False}}
    }
    
    log.info("[llm_match] Calling Gemma LLM for %s='%s'...", entity_type, val)
    try:
        req = urllib.request.Request(
            GEMMA_LLM_ENDPOINT,
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=8.0) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            if "choices" in res_data and len(res_data["choices"]) > 0:
                content = res_data["choices"][0]["message"]["content"].strip()
                log.info("[llm_match] LLM returned: %r", content)
                
                # Scan output for valid strings (longest first to avoid partial matching bugs like 'apple' matching 'pineapple')
                sorted_valid = sorted(valid_list, key=len, reverse=True)
                for valid_opt in sorted_valid:
                    if valid_opt.lower() in content.lower():
                        return valid_opt
    except Exception as e:
        log.error("LLM matching failed for %s='%s': %s", entity_type, val, e)
    
    return None

def sanitize_filter_value(val: str | None, entity_type: str, valid_list: list[str]) -> str | None:
    if not val:
        return val
        
    fast_match = fuzzy_match(val, valid_list)
    if fast_match:
        log.info("[sanitize] Fast match for %s: '%s' -> '%s'", entity_type, val, fast_match)
        return fast_match
        
    smart_match = llm_match(val, entity_type, valid_list)
    if smart_match:
        log.info("[sanitize] LLM match for %s: '%s' -> '%s'", entity_type, val, smart_match)
        return smart_match
        
    log.info("[sanitize] No match found for %s: '%s', keeping original", entity_type, val)
    return val


# District values that are not a specific place: include only when document state
# matches request state (same rule as legacy FAQ / Unknown).
_STATE_SCOPED_WILDCARD_DISTRICTS_CF = frozenset(
    x.casefold()
    for x in (
        "#N/A",
        "N/A",
        "All",
        "General",
        "Multiple",
        "Unknown",
        "Not specified",
        "not provided",
        "FAQ",
    )
)


def _is_state_scoped_wildcard_district(doc_district: str) -> bool:
    dd = (doc_district or "").strip()
    if not dd:
        return False
    return dd.casefold() in _STATE_SCOPED_WILDCARD_DISTRICTS_CF


def _passes_location_filter(
    doc_district: str | None,
    doc_state: str | None,
    filter_district: str | None,
    filter_state: str | None,
) -> bool:
    """Apply optional district/state filter for reviewer, golden, and PoP.

    Wildcard districts (FAQ, Unknown, N/A, All, General, etc.) pass only when
    ``filter_state`` is set and matches ``doc_state`` (case-insensitive).
    """
    fd = (filter_district or "").strip() or None
    fs = (filter_state or "").strip() or None
    dd = (doc_district or "").strip()
    ds = (doc_state or "").strip()

    if not fd and not fs:
        return True

    if _is_state_scoped_wildcard_district(dd):
        if not fs:
            return False
        if not ds:
            return False
        return ds.casefold() == fs.casefold()

    if fd and dd.casefold() != fd.casefold():
        return False
    if fs:
        if not ds:
            return False
        if ds.casefold() != fs.casefold():
            return False
    return True


def _want(s: str | None) -> str | None:
    if s is None:
        return None
    t = str(s).strip()
    return t or None


def _passes_attribute_filters(
    request: SearchRequest,
    *,
    crop: str | None,
    domain: str | None,
    season: str | None,
) -> bool:
    """Require crop/domain/season to match when the client sends them."""
    wc, wd, ws = _want(request.crop), _want(request.domain), _want(request.season)
    if wc:
        dc = _want(crop)
        if not dc or dc.casefold() != wc.casefold():
            return False
    if wd:
        dd = _want(domain)
        if not dd or dd.casefold() != wd.casefold():
            return False
    if ws:
        ds = _want(season)
        if not ds or ds.casefold() != ws.casefold():
            return False
    return True


def _any_request_filters(request: SearchRequest) -> bool:
    return bool(
        _want(request.district)
        or _want(request.state)
        or _want(request.crop)
        or _want(request.domain)
        or _want(request.season)
    )


_FILTER_POOL_MULTIPLIER = 20

def _fetch_k(request: SearchRequest) -> int:
    """When filters are active, widen the candidate pool so post-filtering
    doesn't eat all results.  Return value replaces top_k in _vector_search."""
    if _any_request_filters(request):
        return max(request.top_k * _FILTER_POOL_MULTIPLIER, 50)
    return request.top_k


def build_reviewer_filter_query(request: SearchRequest) -> dict:
    conditions = [{"status": "closed"}]
    
    if _want(request.state):
        st = _want(request.state)
        conditions.append({"details.state": {"$in": [st, st.title(), st.lower(), st.upper()]}})
        
    if _want(request.district):
        dt = _want(request.district)
        wildcards = ["All", "General", "Unknown", "FAQ", "Not specified", "Multiple", "N/A", "#N/A", "not provided"]
        all_wildcards = wildcards + [w.lower() for w in wildcards] + [w.upper() for w in wildcards]
        conditions.append({
            "$or": [
                {"details.district": {"$in": [dt, dt.title(), dt.lower(), dt.upper()]}},
                {"details.district": {"$in": all_wildcards}}
            ]
        })

    if _want(request.crop):
        cr = _want(request.crop)
        conditions.append({
            "$or": [
                {"details.normalised_crop": {"$in": [cr, cr.lower(), cr.title()]}},
                {"details.crop": {"$in": [cr, cr.lower(), cr.title()]}}
            ]
        })
        
    if _want(request.domain):
        dm = _want(request.domain)
        conditions.append({"details.domain": {"$in": [dm, dm.title(), dm.lower()]}})
        
    if _want(request.season):
        sn = _want(request.season)
        conditions.append({"details.season": {"$in": [sn, sn.title(), sn.lower()]}})

    return {"$and": conditions}


def _golden_passes_filters(request: SearchRequest, item: GoldenQAItem) -> bool:
    md = item.metadata or {}
    if not _passes_location_filter(
        md.get("District"),
        md.get("State"),
        request.district,
        request.state,
    ):
        return False
    # Golden schema: Crop, Category (maps to request "domain"), Season, District, State
    return _passes_attribute_filters(
        request,
        crop=md.get("Crop"),
        domain=md.get("Category"),
        season=md.get("Season"),
    )


def _pop_passes_filters(request: SearchRequest, item: PopItem) -> bool:
    md = item.metadata or {}
    # PoP has no district in metadata — only filter by state (and crop/domain/season).
    # Never pass request.district here or every PoP row would fail district match.
    if not _passes_location_filter(
        None,
        md.get("state") or md.get("State"),
        None,
        request.state,
    ):
        return False
    return _passes_attribute_filters(
        request,
        crop=md.get("crop") or md.get("Crop"),
        domain=md.get("domain")
        or md.get("Domain")
        or md.get("category")
        or md.get("Category"),
        season=md.get("season") or md.get("Season"),
    )


def parse_answer(text: str | None) -> str | None:
    if not text:
        return None
    lower = text.lower()
    idx = lower.find("answer:")
    if idx != -1:
        return text[idx + len("answer:"):].strip()
    return None


def serialize_doc(doc: dict) -> QAItem:
    return QAItem(
        id=str(doc["_id"]),
        question=doc.get("question", ""),
        text=doc.get("text"),
        answer=parse_answer(doc.get("text")),
        details=doc.get("details", {}),
        status=doc.get("status", ""),
        source=doc.get("source", ""),
        score=float(doc.get("score", 0.0) or 0.0),
    )


def _parse_golden_qa_text(text: str) -> tuple[str, str]:
    if not text:
        return "", ""
    if "Question:" in text and "\n\nAnswer:" in text:
        parts = text.split("\n\nAnswer:", 1)
        return parts[0].replace("Question:", "", 1).strip(), parts[1].strip()
    if "\n\n" in text:
        parts = text.split("\n\n", 1)
        return parts[0].strip(), parts[1].strip()
    return text.strip(), ""


def _vector_search(
    *,
    collection,
    query_embedding: list[float],
    top_k: int,
    index_name: str,
    project: dict,
    filter_query: dict | None = None,
):
    vector_stage: dict = {
        "$vectorSearch": {
            "index": index_name,
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": max(top_k * 10, 50),
            "limit": top_k,
        }
    }
    if filter_query:
        vector_stage["$vectorSearch"]["filter"] = filter_query

    pipeline = [vector_stage, {"$project": project}]
    return list(collection.aggregate(pipeline))


def build_golden_filter_query(request: SearchRequest) -> dict | None:
    conditions = []
    
    if _want(request.state):
        st = _want(request.state)
        conditions.append({"metadata.State": {"$in": [st, st.title(), st.lower(), st.upper()]}})
        
    if _want(request.crop):
        cr = _want(request.crop)
        conditions.append({"metadata.Crop": {"$in": [cr, cr.lower(), cr.title(), cr.upper()]}})
        
    if not conditions:
        return None
    return {"$and": conditions}


def build_pop_filter_query(request: SearchRequest) -> dict | None:
    conditions = []
    
    if _want(request.state):
        st = _want(request.state)
        # PoP uses "metadata.state"
        conditions.append({"metadata.state": {"$in": [st, st.title(), st.lower(), st.upper()]}})
        
    if not conditions:
        return None
    return {"$and": conditions}


@app.post("/search", response_model=MultiSearchResponse, response_model_exclude_none=True)
def search_unified(request: SearchRequest):
    t0 = time.perf_counter()
    
    if request.sanitized:
        _ensure_cache()
        if request.state:
            request.state = sanitize_filter_value(request.state, "state", _VALID_STATES_CACHE)
        if request.crop:
            request.crop = sanitize_filter_value(request.crop, "crop", _VALID_CROPS_CACHE)

    active_filters = {k: v for k, v in {
        "state": request.state, "district": request.district,
        "crop": request.crop, "domain": request.domain,
        "season": request.season,
    }.items() if v}
    log.info("[/search] mode=%r query=%r top_k=%d threshold=%.2f filters=%s sanitized=%s",
             request.mode, request.query[:80], request.top_k, request.threshold, active_filters, request.sanitized)

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    query_text = f"Represent this sentence for searching relevant passages: {request.query}"
    query_embedding = model.encode(query_text, normalize_embeddings=True).tolist()

    # ---------------- Reviewer Search ----------------
    t_rev = time.perf_counter()
    reviewer_raw = _vector_search(
        collection=reviewer_collection,
        query_embedding=query_embedding,
        top_k=request.top_k,
        index_name=VECTOR_INDEX_NAME,
        filter_query=build_reviewer_filter_query(request),
        project={
            "_id": 1,
            "question": 1,
            "text": 1,
            "answer": 1,
            "details": 1,
            "status": 1,
            "source": 1,
            "score": {"$meta": "vectorSearchScore"},
        },
    )

    reviewer_items = []
    if reviewer_raw:
        question_ids = [ObjectId(d["_id"]) for d in reviewer_raw]
        answers_cursor = answers_collection.find({"questionId": {"$in": question_ids}, "isFinalAnswer": True})
        
        answers_map = {}
        for ans in answers_cursor:
            # If multiple final answers exist, the last one overwrites, which is acceptable
            answers_map[str(ans["questionId"])] = ans
            
        author_ids = [ans["authorId"] for ans in answers_map.values() if "authorId" in ans]
        users_cursor = users_collection.find({"_id": {"$in": author_ids}})
        users_map = {str(u["_id"]): f"{u.get('firstName', '')} {u.get('lastName', '')}".strip() for u in users_cursor}

        for d in reviewer_raw:
            qid = str(d["_id"])
            score = float(d.get("score", 0.0) or 0.0)
            
            ans_doc = answers_map.get(qid)
            answer_text = ""
            sources = []
            agri_expert = None
            
            if ans_doc:
                answer_text = ans_doc.get("answer", "")
                sources = ans_doc.get("sources", [])
                author_id = str(ans_doc.get("authorId", ""))
                agri_expert = users_map.get(author_id)
            else:
                # Fallback to parsed answer if no FinalAnswer is found
                parsed_ans = parse_answer(d.get("text"))
                answer_text = parsed_ans if parsed_ans else d.get("answer", "")

            if score >= request.threshold and answer_text and answer_text.strip():
                item = QAItem(
                    id=qid,
                    question=d.get("question", ""),
                    text=d.get("text", ""),
                    answer=answer_text,
                    details=d.get("details", {}),
                    status=d.get("status", ""),
                    source=d.get("source", ""),
                    score=score,
                    agri_expert=agri_expert if agri_expert else None,
                    sources=sources if sources else None
                )
                reviewer_items.append(item)

    reviewer_items.sort(key=lambda x: x.score, reverse=True)
    reviewer_items = reviewer_items[: request.top_k]
    log.info("[/search] REVIEWER returned=%d (%.0fms)", len(reviewer_items), (time.perf_counter() - t_rev) * 1000)

    # ---------------- Golden QA Search ----------------
    t_gold = time.perf_counter()
    golden_raw = _vector_search(
        collection=golden_qa_collection,
        query_embedding=query_embedding,
        top_k=request.top_k,
        index_name=GOLDEN_VECTOR_INDEX_NAME,
        filter_query=build_golden_filter_query(request),
        project={
            "text": 1,
            "metadata": 1,
            "score": {"$meta": "vectorSearchScore"},
        },
    )

    golden_items = []
    for d in golden_raw:
        score = float(d.get("score", 0.0) or 0.0)
        if score < request.threshold:
            continue
        text = d.get("text", "") or ""
        q, a = _parse_golden_qa_text(text)
        if a and a.strip():
            raw_meta = d.get("metadata", {}) or {}
            meta = GoldenQAMetadata(
                category=raw_meta.get("Category"),
                year=str(raw_meta.get("Year")) if raw_meta.get("Year") else None,
                month=str(raw_meta.get("Month")) if raw_meta.get("Month") else None,
                day=str(raw_meta.get("Day")) if raw_meta.get("Day") else None,
                crop=raw_meta.get("Crop"),
                district=raw_meta.get("District"),
                block_name=raw_meta.get("BlockName"),
                sector=raw_meta.get("Sector"),
                sector_a=raw_meta.get("Sector (A)"),
                season=raw_meta.get("Season"),
                query_type=raw_meta.get("QueryType"),
                agri_specialist=raw_meta.get("Agri Specialist"),
                date=str(raw_meta.get("Date")) if raw_meta.get("Date") else None,
                source=raw_meta.get("Source [Name and Link]"),
                state=raw_meta.get("state") or raw_meta.get("State")
            )
            golden_items.append(
                GoldenQAItem(
                    text=text,
                    question=q,
                    answer=a,
                    metadata=meta,
                    score=score,
                )
            )

    golden_items.sort(key=lambda x: x.score, reverse=True)
    golden_items = golden_items[: request.top_k]
    log.info("[/search] GOLDEN returned=%d (%.0fms)", len(golden_items), (time.perf_counter() - t_gold) * 1000)

    # ---------------- PoP Search (Conditional) ----------------
    pop_items = None
    if request.mode.lower() == "all":
        pop_items = []
        t_pop = time.perf_counter()
        pop_raw = _vector_search(
            collection=golden_pop_collection,
            query_embedding=query_embedding,
            top_k=request.top_k,
            index_name=GOLDEN_VECTOR_INDEX_NAME,
            filter_query=build_pop_filter_query(request),
            project={
                "text": 1,
                "metadata": 1,
                "score": {"$meta": "vectorSearchScore"},
            },
        )

        for d in pop_raw:
            score = float(d.get("score", 0.0) or 0.0)
            if score >= request.threshold:
                pop_items.append(
                    PopItem(
                        text=(d.get("text", "") or ""),
                        metadata=(d.get("metadata", {}) or {}),
                        score=score,
                    )
                )

        pop_items.sort(key=lambda x: x.score, reverse=True)
        pop_items = pop_items[: request.top_k]
        log.info("[/search] POP returned=%d (%.0fms)", len(pop_items), (time.perf_counter() - t_pop) * 1000)

    # ---------------- Final Response ----------------
    log.info("[/search] TOTAL reviewer=%d golden=%d pop=%d (%.0fms)",
             len(reviewer_items), len(golden_items), len(pop_items or []),
             (time.perf_counter() - t0) * 1000)

    return MultiSearchResponse(
        reviewer=reviewer_items,
        golden=golden_items,
        pop=pop_items,
    )

# ---------------------------------------------------------------------------
#  /agent_search — transcript → extract (question, state, crop) → /search
# ---------------------------------------------------------------------------



_EXTRACT_SYSTEM_PROMPT = """You are an agricultural call-center transcript analyst.

You will receive a conversation transcript between a farmer and an agricultural expert at a call center (in English).

Your job is to extract:
1. "question": A concise agricultural question that captures the farmer's core problem or query. Keep it short and searchable.
2. "state": The Indian state where the farmer is located (e.g. "Punjab", "West Bengal"). Use "All" if unclear.
3. "crop": The crop the farmer is asking about (e.g. "Wheat", "Rice"). Use "All" if unclear.

CRITICAL INSTRUCTIONS:
- You MUST output ONLY a valid JSON object with the keys "question", "state", and "crop".
- DO NOT output any markdown formatting, preamble, conversational text, or reasoning.
- START your response immediately with the `{` character.
- Example output: {"question": "How to treat leaf curl?", "state": "Maharashtra", "crop": "Chilli"}"""


def _extract_from_transcript(transcript: str) -> dict:
    """Call local Gemma model to extract (question, state, crop) from transcript."""
    payload = {
        "model": "google/gemma-4-E4B-it",
        "messages": [
            {"role": "system", "content": _EXTRACT_SYSTEM_PROMPT},
            {"role": "user", "content": transcript}
        ],
        "max_tokens": 400,
        "temperature": 0.0,
        "extra_body": {"chat_template_kwargs": {"enable_thinking": False}}
    }
    
    try:
        req = urllib.request.Request(
            GEMMA_LLM_ENDPOINT,
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10.0) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            log.info("RAW RES DATA: %s", res_data)
            if "choices" in res_data and len(res_data["choices"]) > 0:
                msg = res_data["choices"][0]["message"]
                content = msg.get("content")
                if not content and "reasoning" in msg:
                    content = msg.get("reasoning")
                    
                if not content:
                    raise ValueError(f"Content and Reasoning were both empty! choices: {res_data['choices']}")
                
                content = content.strip()
                log.info("[_extract_from_transcript] Raw LLM output: %r", content)
                
                # Attempt to find JSON block using regex if it still outputted text
                json_match = re.search(r'(\{.*\})', content, re.DOTALL)
                if json_match:
                    content = json_match.group(1)
                
                content = content.strip()
                log.info("[_extract_from_transcript] Cleaned LLM output: %r", content)
                return json.loads(content)
    except Exception as e:
        log.error("LLM extraction failed: %s", e)
        raise ValueError(f"LLM extraction failed: {e}")
        
    raise ValueError("LLM returned empty response")


class ExtractRequest(BaseModel):
    query: str


class ExtractResponse(BaseModel):
    extracted_question: str
    extracted_state: str
    extracted_crop: str


@app.post("/extract", response_model=ExtractResponse)
def extract_query(request: ExtractRequest):
    """Accept a conversation transcript, extract question, state, and crop,
    and sanitize them. Returns the sanitized values to the frontend."""
    t0 = time.perf_counter()

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query (transcript) must not be empty.")

    # --- Step 1: Extract question, state, crop via LLM ---
    t_llm = time.perf_counter()
    try:
        extracted = _extract_from_transcript(request.query)
    except Exception as e:
        log.error("[/extract] LLM extraction failed: %s", e)
        raise HTTPException(status_code=502, detail=f"LLM extraction failed: {e}")

    question = extracted.get("question", request.query)
    state = extracted.get("state", "All")
    crop = extracted.get("crop", "All")

    log.info(
        "[/extract] LLM extracted  question=%r  state=%r  crop=%r  (%.0fms)",
        question[:80], state, crop, (time.perf_counter() - t_llm) * 1000,
    )

    # --- Step 2: Sanitize state and crop ---
    # We run them through the 3-tier sanitization pipeline here
    # so the frontend dropdowns can pre-select exact matching strings.
    final_state = state
    final_crop = crop
    
    _ensure_cache()
    if state != "All":
        final_state = sanitize_filter_value(state, "state", _VALID_STATES_CACHE) or state
    
    if crop != "All":
        final_crop = sanitize_filter_value(crop, "crop", _VALID_CROPS_CACHE) or crop
        
    log.info("[/extract] Final sanitized values: state=%r, crop=%r (total %.0fms)", 
             final_state, final_crop, (time.perf_counter() - t0) * 1000)

    return ExtractResponse(
        extracted_question=question,
        extracted_state=final_state,
        extracted_crop=final_crop,
    )


@app.get("/filters")
def get_filters():
    """Fetches exact, unique state and crop values available in the Reviewer Q&A database."""
    t0 = time.perf_counter()
    _ensure_cache()
    log.info("[/filters] fetched %d states and %d crops from cache (%.0fms)", len(_VALID_STATES_CACHE), len(_VALID_CROPS_CACHE), (time.perf_counter() - t0) * 1000)
    
    return {
        "states": _VALID_STATES_CACHE,
        "crops": _VALID_CROPS_CACHE
    }


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)


# uvicorn main:app --host 0.0.0.0 --port 8001 &
