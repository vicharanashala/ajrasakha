FROM python:3.12-slim

WORKDIR /app

COPY . .

# ✅ Install CPU-only torch FIRST
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Then install your project
RUN pip install --no-cache-dir -e .

CMD ["python", "-m", "fastmcp", "run"]