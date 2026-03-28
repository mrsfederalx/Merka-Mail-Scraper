FROM python:3.12-slim

WORKDIR /app

# System deps for Playwright + asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (build context = proje kökü)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright + Chromium
RUN playwright install chromium
RUN playwright install-deps chromium

# Copy backend package (imports: from backend.xxx)
COPY backend/ ./backend/

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
