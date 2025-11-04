from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
import os

app = FastAPI(title="AgriParam API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for model and tokenizer
model = None
tokenizer = None

class QueryRequest(BaseModel):
    query: str
    max_tokens: int = 300
    temperature: float = 0.1

class QueryResponse(BaseModel):
    response: str

@app.on_event("startup")
async def load_model():
    """Load the model on startup"""
    global model, tokenizer
    print("Loading AgriParam model...")
    model_name = "bharatgenai/AgriParam"
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=False)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        trust_remote_code=True,
        dtype=torch.bfloat16 if torch.cuda.is_available() else torch.bfloat32,
        device_map="auto"
    )
    print("Model loaded successfully!")

@app.get("/")
async def root():
    """Serve the frontend"""
    return FileResponse("static/index.html")

@app.post("/query", response_model=QueryResponse)
async def query_model(request: QueryRequest):
    """Query the AgriParam model"""
    global model, tokenizer
    
    if model is None or tokenizer is None:
        return QueryResponse(response="Model is not loaded yet. Please wait.")
    
    # Format prompt
    prompt = f"<user> {request.query} <assistant>"
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    
    # Generate response
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=request.max_tokens,
            do_sample=True,
            top_k=50,
            top_p=0.95,
            temperature=request.temperature,
            eos_token_id=tokenizer.eos_token_id,
            use_cache=False
        )
    
    # Decode response
    full_response = tokenizer.decode(output[0], skip_special_tokens=True)
    
    # Extract only the assistant's response (remove the user's query part)
    if "<assistant>" in full_response:
        response = full_response.split("<assistant>")[-1].strip()
    else:
        # If format is different, try to extract after the query
        response = full_response.replace(prompt, "").strip()
    
    return QueryResponse(response=response)

# Mount static files for frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": model is not None}
