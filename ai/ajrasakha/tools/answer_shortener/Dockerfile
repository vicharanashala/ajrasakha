FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

RUN addgroup --system app && adduser --system --ingroup app app

COPY --chown=app:app . /app/answer_shortener

USER app

EXPOSE 8007

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8007/health/ready', timeout=2)" || exit 1

CMD ["uvicorn", "answer_shortener.api:app", "--host", "0.0.0.0", "--port", "8007"]
