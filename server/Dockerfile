FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 10001 attendance \
    && adduser --system --uid 10001 --ingroup attendance attendance

COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY --chown=attendance:attendance app ./app
COPY --chown=attendance:attendance notification-config ./notification-config

RUN mkdir -p /app/logs /app/media/photos \
    && chown -R attendance:attendance /app/logs /app/media

USER attendance

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--no-proxy-headers", "--limit-concurrency", "50", "--timeout-keep-alive", "5"]
