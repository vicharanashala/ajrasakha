import os
import asyncio
from datetime import datetime
from bson.objectid import ObjectId
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# Load env before importing services
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

from services.gee_service import gee_service
from services.weather_service import weather_service
from services.llm_router import llm_router

app = FastAPI(title="Ajrasakha Personalizer Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from typing import Optional, List, Dict, Any

class QueryRequest(BaseModel):
    query: str
    latitude: float
    longitude: float
    language: str = "en-IN"
    satellite: Optional[dict] = None
    weather: Optional[dict] = None
    chat_history: Optional[List[Dict[str, Any]]] = None

@app.post("/api/query")
async def process_query(request: QueryRequest):
    try:
        # 1. Validate Land & Get Satellite Data
        if request.satellite:
            satellite_data = request.satellite
        else:
            try:
                satellite_data = gee_service.get_satellite_data(request.latitude, request.longitude)
            except Exception as e:
                if "Location is not agricultural land" in str(e) or "Security Alert" in str(e) or "BUILT-UP AREA" in str(e) or "WATER BODY" in str(e):
                    return {
                        "status": "rejected",
                        "answer": f"Validation Failed: {str(e)} Please ask questions from an agricultural location."
                    }
                elif "GEE Offline" in str(e) or "not initialized" in str(e):
                    satellite_data = {"error": "Satellite data temporarily offline"}
                else:
                    satellite_data = {"error": f"Failed to fetch satellite data: {str(e)}"}

        # 2. Get Weather Forecast
        if request.weather:
            weather_data = request.weather
        else:
            try:
                weather_data = weather_service.get_forecast(request.latitude, request.longitude)
            except Exception as e:
                weather_data = {"error": f"Failed to fetch weather: {str(e)}"}

        # 3. Route to LLM
        # We assume satellite_data is a dict. If it returned the tuple (data, "Success") from the original code, we handle it:
        if isinstance(satellite_data, tuple):
            sat_data_dict = satellite_data[0]
        else:
            sat_data_dict = satellite_data

        response = await llm_router.route_query(
            query=request.query,
            satellite_data=sat_data_dict,
            weather_data=weather_data,
            user_lang=request.language,
            lat=request.latitude,
            lon=request.longitude,
            chat_history=request.chat_history
        )
        
        return {
            "satellite": sat_data_dict,
            "weather": weather_data,
            "llm_response": response
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/telemetry")
def get_telemetry(lat: float, lon: float):
    try:
        try:
            satellite_data = gee_service.get_satellite_data(lat, lon)
        except Exception as e:
            satellite_data = {"error": f"Failed: {str(e)}"}
            
        try:
            weather_data = weather_service.get_forecast(lat, lon)
        except Exception as e:
            weather_data = {"error": f"Failed: {str(e)}"}
            
        sat_data_dict = satellite_data[0] if isinstance(satellite_data, tuple) else satellite_data
        
        return {
            "satellite": sat_data_dict,
            "weather": weather_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/escalation/{escalation_id}")
async def get_escalation_status(escalation_id: str):
    try:
        if llm_router.review_col is None:
            raise HTTPException(status_code=500, detail="Database not connected")
        # First, try to find an answer in the root 'answers' collection
        # Check if the escalation_id exists in answers
        try:
            obj_id = ObjectId(escalation_id)
        except:
            obj_id = escalation_id
            
        answer_doc = llm_router.answers_col.find_one({
            "$or": [{"questionId": obj_id}, {"questionId": str(escalation_id)}]
        })
        print(f"DEBUG get_escalation_status: escalation_id={escalation_id}, found_answer={answer_doc is not None}, has_answer_field={answer_doc.get('answer') if answer_doc else False}", flush=True)
        
        if answer_doc and answer_doc.get("answer"):
            return {
                "status": "answered",
                "answer": answer_doc.get("answer")
            }
            
        doc = llm_router.review_col.find_one({
            "$or": [
                {"_id": obj_id},
                {"root_question_id": str(escalation_id)},
                {"root_question_id": escalation_id}
            ]
        })
        if doc and doc.get("status") == "answered":
            return {
                "status": "answered",
                "answer": doc.get("answer")
            }
        
        if doc or llm_router.questions_col.find_one({"_id": obj_id}):
            return {
                "status": "pending",
                "answer": None
            }
            
        raise HTTPException(status_code=404, detail="Escalation not found")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def background_kb_ingestion():
    while True:
        try:
            if llm_router.review_col is not None and llm_router.pop_col is not None:
                # Find escalations that haven't been ingested yet
                cursor = llm_router.review_col.find({
                    "kb_ingested": {"$ne": True}
                })
                
                for doc in cursor:
                    question = doc.get("question", "")
                    answer = doc.get("answer", "")
                    
                    # If answer is not in local doc, check root db
                    if not answer and "root_question_id" in doc:
                        try:
                            obj_id = ObjectId(doc["root_question_id"])
                        except:
                            obj_id = doc["root_question_id"]
                        
                        root_ans = llm_router.answers_col.find_one({
                            "$or": [{"questionId": obj_id}, {"questionId": str(obj_id)}]
                        })
                        if root_ans and root_ans.get("answer"):
                            answer = root_ans.get("answer")
                    
                    if question and answer:
                        combined_text = f"Q: {question}\nA: {answer}"
                        
                        try:
                            # Generate embedding
                            embed_resp = llm_router.gemini_client.models.embed_content(
                                model='gemini-embedding-2', 
                                contents=combined_text,
                                config={'output_dimensionality': 768}
                            )
                            
                            # Insert into pop_v2
                            kb_doc = {
                                "text": combined_text,
                                "source": "Previous Expert Answer",
                                "embedding": embed_resp.embeddings[0].values,
                                "created_at": datetime.now()
                            }
                            llm_router.pop_col.insert_one(kb_doc)
                            
                            # Mark as ingested
                            llm_router.review_col.update_one(
                                {"_id": doc["_id"]},
                                {"$set": {"kb_ingested": True, "answer": answer}}
                            )
                            print(f"Successfully ingested expert answer for escalation {doc['_id']} into KB.")
                        except Exception as inner_e:
                            print(f"Failed to ingest expert answer {doc['_id']}: {inner_e}")
                            
        except Exception as e:
            print(f"Background KB ingestion loop error: {e}")
            
        await asyncio.sleep(30) # Check every 30 seconds

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(background_kb_ingestion())

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv('PORT', 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
