from fastapi import FastAPI
import uvicorn

app = FastAPI(
    title="GDB Coverage Gap Detector",
    description="API for analyzing disclaimer-triggered queries and identifying GDB coverage gaps.",
    version="1.0.0"
)

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "gap_detector"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
