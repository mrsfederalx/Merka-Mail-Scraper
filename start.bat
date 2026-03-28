@echo off
setlocal enabledelayedexpansion

:: Bat dosyasinin bulundugu dizine git
cd /d "%~dp0"

title Merka Mail Scraper - Baslatici

echo.
echo  ============================================
echo   Merka Mail Scraper - Baslatiliyor
echo  ============================================
echo.

:: ── Kontroller ───────────────────────────────────────────────
if not exist ".env" (
    echo [HATA] .env dosyasi bulunamadi. Once setup.bat calistirin.
    pause & exit /b 1
)

if not exist "backend\venv\Scripts\activate.bat" (
    echo [HATA] Backend sanal ortami bulunamadi. Once setup.bat calistirin.
    pause & exit /b 1
)

if not exist "frontend\node_modules" (
    echo [HATA] Frontend paketleri bulunamadi. Once setup.bat calistirin.
    pause & exit /b 1
)

echo [OK] Ortam kontrolu gecti
echo.

:: ── Backend ──────────────────────────────────────────────────
echo [1/2] Backend baslatiliyor  (http://localhost:8000) ...
start "Merka Backend" cmd /k "cd /d "%~dp0" && call backend\venv\Scripts\activate.bat && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload --log-level info"

timeout /t 4 /nobreak >nul

:: ── Frontend ─────────────────────────────────────────────────
echo [2/2] Frontend baslatiliyor (http://localhost:5173) ...
start "Merka Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  ============================================
echo   Uygulama baslatildi!
echo  ============================================
echo.
echo   Backend  : http://localhost:8000
echo   Frontend : http://localhost:5173
echo   API Docs : http://localhost:8000/docs
echo.
echo   HATA DURUMUNDA:
echo   - "Merka Backend" penceresindeki hata mesajini kontrol edin
echo   - PostgreSQL calismiyor olabilir
echo   - .env dosyasindaki DATABASE_URL'yi kontrol edin
echo.

timeout /t 4 /nobreak >nul
start http://localhost:5173

echo  Cikis icin bu pencereyi kapatabilirsiniz.
pause
