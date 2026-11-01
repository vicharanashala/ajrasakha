from fastapi import APIRouter, Query, HTTPException
from typing import Optional, Dict, Any
from app.database import get_db
import re

router = APIRouter(prefix="/gdb", tags=["GDB Catalog"])

@router.get("/entries")
def list_gdb_entries(
    crop: Optional[str] = None,
    domain: Optional[str] = None,
    status: Optional[str] = None,
    is_flagged: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50
):
    db = get_db()
    query: Dict[str, Any] = {}
    if crop and crop != "ALL":
        query["crop"] = {"$regex": crop, "$options": "i"}
    if domain and domain != "ALL":
        query["domain"] = domain
    if status and status != "ALL":
        query["status"] = status
    if is_flagged is not None:
        query["is_flagged"] = is_flagged
    if search:
        s = re.escape(search)
        query["$or"] = [
            {"_id": {"$regex": s, "$options": "i"}},
            {"question_hi": {"$regex": s, "$options": "i"}},
            {"question_en": {"$regex": s, "$options": "i"}},
            {"sub_domain": {"$regex": s, "$options": "i"}},
            {"answer_hi": {"$regex": s, "$options": "i"}},
            {"answer_en": {"$regex": s, "$options": "i"}}
        ]
        
    total = db["gdb_entries"].count_documents(query)
    skip = (page - 1) * limit
    cursor = db["gdb_entries"].find(query).skip(skip).limit(limit).sort("metrics.helpful_ratio", 1)
    
    return {"total": total, "page": page, "limit": limit, "entries": list(cursor)}

@router.get("/entries/{gdb_id}")
def get_entry(gdb_id: str):
    db = get_db()
    e = db["gdb_entries"].find_one({"_id": gdb_id})
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    return e
