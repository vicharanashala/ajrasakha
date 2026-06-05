"""Entry point: run Golden FastAPI with uvicorn."""

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "golden_api:app",
        host="0.0.0.0",
        port=8005,
        reload=False,
    )
