FROM python:3.10-slim
WORKDIR /app

COPY mcp/imd_weather_api_wrapper/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY mcp/imd_weather_api_wrapper/ .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]