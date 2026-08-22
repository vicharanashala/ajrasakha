import os
import requests
import json
from datetime import datetime
from pymongo import MongoClient
import asyncio
import ollama
from google import genai
from google.genai import types
import logging

from .lgd_service import get_official_location
from .sarvam_service import translate_text

logger = logging.getLogger(__name__)

class LLMRouter:
    def __init__(self):
        self.ollama_url = os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434/v1')
        self.ollama_model = os.getenv('OLLAMA_MODEL', 'qwen2.5')
        
        # Gemini config
        self.gemini_key = os.getenv('GEMINI_API_KEY', 'your-gemini-api-key')
        self.gemini_client = genai.Client(api_key=self.gemini_key)
        
        mongo_uri = os.getenv('MONGODB_URI')
        self.client = MongoClient(mongo_uri) if mongo_uri else None
        self.db = self.client[os.getenv('DB_NAME', 'agriai')] if self.client is not None else None
        self.review_col = self.db[os.getenv('REVIEW_COLLECTION', 'ajrasakha_faq')] if self.db is not None else None
        self.gdb_col = self.db['farmer_feedback_gdb_entries'] if self.db is not None else None
        self.pop_col = self.db[os.getenv('POP_COLLECTION', 'pop_v2')] if self.db is not None else None
        self.answers_col = self.client['agriai']['answers'] if self.client is not None else None
        self.questions_col = self.client['agriai']['questions'] if self.client is not None else None


    async def route_query(self, query, satellite_data, weather_data, user_lang="en-IN", lat=0.0, lon=0.0, chat_history=None):
        # 1. Translate Query & Get Location Concurrently
        english_query = query
        state, district = "Unknown", "Unknown"
        
        async def fetch_translation():
            nonlocal english_query
            if user_lang and user_lang != "en-IN":
                english_query = await translate_text(query, user_lang, "en-IN")
                logger.info(f"Translated query to English: {english_query}")
                
        async def fetch_location():
            nonlocal state, district
            state, district = await get_official_location(lat, lon)
            logger.info(f"LGD Normalized Location: {state}, {district}")
            
        await asyncio.gather(fetch_translation(), fetch_location())



        # 4. PoP Vector Search Context Retrieval
        pop_context_str = ""
        if self.pop_col is not None:
            try:
                def do_embed_and_search():
                    # Embed query using Gemini
                    embed_resp = self.gemini_client.models.embed_content(
                        model='gemini-embedding-2', 
                        contents=english_query,
                        config={'output_dimensionality': 768}
                    )
                    query_emb = embed_resp.embeddings[0].values
                    
                    # Use MongoDB Atlas Vector Search
                    vector_results = self.pop_col.aggregate([
                        {
                            "$vectorSearch": {
                                "index": "vector_index", # User needs to create this index in Atlas
                                "path": "embedding",
                                "queryVector": query_emb,
                                "numCandidates": 20,
                                "limit": 3
                            }
                        },
                        {
                            "$project": {
                                "text": 1,
                                "source": 1,
                                "score": {"$meta": "vectorSearchScore"}
                            }
                        }
                    ])
                    contexts = list(vector_results)
                    return contexts
                    
                contexts = await asyncio.to_thread(do_embed_and_search)
                pop_context_str = "\n".join([f"[{c['source']}]: {c['text']}" for c in contexts])
                unique_sources = list(set([c.get('source') for c in contexts if c.get('source')]))
            except Exception as e:
                logger.warning(f"Vector search failed (Index might be missing): {e}")

        # 5. Build the LLM Prompt
        chat_context = ""
        if chat_history:
            chat_context = "PREVIOUS CONVERSATION HISTORY:\n"
            for turn in chat_history[-3:]: # only last 3 turns
                chat_context += f"Farmer: {turn.get('user_query', '')}\n"
                chat_context += f"You: {turn.get('ai_response', '')}\n\n"

        system_prompt = f"""You are an expert AI agricultural assistant.
You have been provided with real-time satellite and weather data for the farmer's exact location.
Use this data to answer their query.

LOCATION:
State: {state}
District: {district}

SATELLITE DATA:
NDVI (Crop Health -1 to 1): {satellite_data.get('ndvi')}
Soil Moisture: {satellite_data.get('soil_moisture')}%
Land Surface Temp (LST): {satellite_data.get('lst', 'N/A')} °C
Water Index (NDWI): {satellite_data.get('ndwi', 'N/A')}
Avg Daily Rainfall (Last 45 Days): {satellite_data.get('average_rainfall', 'N/A')} mm/day

WEATHER FORECAST:
{json.dumps(weather_data.get('forecast'), indent=2)}

PACKAGE OF PRACTICES (Textbook Context):
{pop_context_str if pop_context_str else "No specific textbook context found."}

{chat_context}
RULES:
1. If the SATELLITE DATA, WEATHER FORECAST, or PACKAGE OF PRACTICES contains enough information to safely and accurately answer the query, provide the answer.
2. If the user's query is too vague or missing crucial information (such as the name of the crop), politely ask them to provide that specific information. Do NOT escalate.
3. If the query asks for a recommendation (e.g. "what to plant here?"), use the location, weather, and satellite data to provide a general, helpful recommendation.
4. ONLY if the query involves a severe agricultural emergency (like an unidentified disease destroying a whole field) or a highly specialized technical issue that requires human expert review, respond exactly with the phrase: "I_DONT_KNOW_ESCALATE". Do not say anything else.
"""

        # 6. Call Gemini
        answer = ""
        try:
            logger.info("Calling Gemini API...")
            def call_gemini():
                return self.gemini_client.models.generate_content(
                    model='gemini-3.5-flash-lite',
                    contents=[system_prompt + f"\n\nFARMER QUERY: {english_query}"]
                )
            response = await asyncio.to_thread(call_gemini)
            answer = response.text.strip()
        except Exception as e:
            logger.error(f"Gemini failed: {e}. Falling back to Ollama.")
            # 7. Fallback to Ollama
            try:
                ollama_endpoint = self.ollama_url.replace('/v1', '/api/generate') 
                payload = {
                    "model": self.ollama_model,
                    "prompt": f"{system_prompt}\n\nFARMER QUERY: {english_query}\n\nANSWER:",
                    "stream": False
                }
                def call_ollama():
                    return requests.post(ollama_endpoint, json=payload, timeout=30)
                ai_res = await asyncio.to_thread(call_ollama)
                if ai_res.status_code == 200:
                    answer = ai_res.json().get('response', '').strip()
                else:
                    raise Exception(f"Ollama returned {ai_res.status_code}")
            except Exception as fallback_e:
                return {
                    "status": "error",
                    "answer": f"AI Processing Error (Both Gemini and Ollama failed): {str(fallback_e)}"
                }

        # 8. Escalation Logic
        if "I_DONT_KNOW_ESCALATE" in answer.upper():
            escalation_id = await self._escalate_to_admin(english_query, satellite_data, weather_data, lat, lon)
            escalated_msg = "This is a very specific farm condition. I have escalated your satellite data and query to an expert agronomist. They will review your farm's profile and answer shortly on your dashboard."
            
            final_escalated_msg = await translate_text(escalated_msg, "en-IN", user_lang) if user_lang != "en-IN" else escalated_msg
            return {
                "status": "escalated",
                "answer": final_escalated_msg,
                "escalation_id": escalation_id
            }
        else:
            final_answer = await translate_text(answer, "en-IN", user_lang) if user_lang != "en-IN" else answer
            
            source = "AI Generation"
            if 'unique_sources' in locals() and unique_sources:
                pdf_sources = [s for s in unique_sources if str(s).lower().endswith('.pdf')]
                if pdf_sources:
                    source = f"ICAR ({', '.join(pdf_sources)})"
                else:
                    source = f"ICAR ({', '.join([str(s) for s in unique_sources])})"
                
            return {
                "status": "success",
                "answer": final_answer,
                "source": source
            }

    async def _escalate_to_admin(self, query, satellite_data, weather_data, lat, lon):
        if self.review_col is None:
            print("MongoDB not connected. Cannot escalate.")
            return
            
        doc = {
            "question": query,
            "status": "pending",
            "source": "personalizer_app",
            "location": {"lat": lat, "lon": lon},
            "context_injected": {
                "satellite": satellite_data,
                "weather": weather_data
            },
            "created_at": datetime.now(),
            "ai_draft": "" # Empty because the AI refused to guess
        }
        root_db_id = None
        try:
            state, district = await get_official_location(lat, lon)
            
            def make_request():
                return requests.post("http://localhost:3141/api/questions/escalate-from-personalizer", json={
                    "question": query,
                    "details": {
                        "state": state,
                        "district": district,
                        "crop": "Paddy", # Default for now, can be extracted from context
                        "season": "Kharif",
                        "domain": ["Crop Protection"]
                    }
                }, timeout=5)

            resp = await asyncio.to_thread(make_request)
            if resp.status_code == 201:
                root_db_id = resp.json().get("data", {}).get("_id")
        except Exception as e:
            print("Failed to push to root backend:", e)

        if root_db_id:
            doc["root_question_id"] = root_db_id
            
        def do_insert():
            return self.review_col.insert_one(doc)
            
        result = await asyncio.to_thread(do_insert)
        print(f"Escalated question to Admin Dashboard. Root ID: {root_db_id} Local ID: {result.inserted_id}")
        return root_db_id if root_db_id else str(result.inserted_id)

llm_router = LLMRouter()
