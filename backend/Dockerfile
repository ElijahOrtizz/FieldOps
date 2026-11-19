FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
# pytest and httpx are test-only; leave them out of the runtime image
RUN grep -v -i -E "^(pytest|httpx)" requirements.txt > runtime-requirements.txt \
    && pip install --no-cache-dir -r runtime-requirements.txt

COPY . .
RUN useradd --create-home app && chown -R app /app
USER app

EXPOSE 8000
# STRYDA_ENV, SECRET_KEY, DATABASE_URL, CORS_ORIGINS, S3_BUCKET and AWS_REGION come from the environment
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
