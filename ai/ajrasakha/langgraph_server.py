from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from agents.orchestrator import master_graph

app = FastAPI(title="AjraSakha LangGraph API")

class ChatRequest(BaseModel):
    phone_number: str 
    question: str      

@app.post("/api/ask")
async def ask_langgraph(request: ChatRequest):
    try:
        config = {"configurable": {"thread_id": request.phone_number}}
        input_data = {"messages": [HumanMessage(content=request.question)]}
        
        print(f"\n[API] Received question from {request.phone_number}: '{request.question}'")
        
        result = await master_graph.ainvoke(input_data, config=config)
        
        final_list = result["final_answer"]
        actual_answer = final_list[-1] if isinstance(final_list, list) and len(final_list) > 0 else str(final_list)
        
        return {
            "status": "success",
            "phone_number": request.phone_number,
            "answer": actual_answer 
        }
        
    except Exception as e:
        print(f"[API Error] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))