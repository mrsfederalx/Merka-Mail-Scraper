@echo off
setlocal enabledelayedexpansion

:: Bat dosyasinin bulundugu dizine git
cd /d "%~dp0"

title Merka Mail Scraper - Kurulum

echo.
echo  ============================================
echo   Merka Mail Scraper - Kurulum
echo  ============================================
echo.

:: ── Python kontrolu ──────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [HATA] Python bulunamadi. https://python.org adresinden Python 3.11+ yukleyin.
    pause & exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [OK] Python %PYVER% bulundu

:: ── Node.js kontrolu ─────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden Node.js 20+ yukleyin.
    pause & exit /b 1
)
for /f %%v in ('node --version') do set NODEVER=%%v
echo [OK] Node.js %NODEVER% bulundu

:: ── .env dosyasi ─────────────────────────────────────────────
if not exist ".env" (
    echo.
    echo [INFO] .env dosyasi bulunamadi, .env.example kopyalaniyor...
    copy ".env.example" ".env" >nul
    echo [OK] .env olusturuldu
    echo.
    echo  !! ONEMLI: .env dosyasini duzenlemeniz gerekiyor !!
    echo     - DATABASE_URL: Yerel PostgreSQL baglanti dizesini girin
    echo     - JWT_ACCESS_SECRET ve JWT_REFRESH_SECRET: Guvenli rastgele deger girin
    echo.
) else (
    echo [OK] .env dosyasi mevcut
)

:: ── Backend - Sanal ortam ─────────────────────────────────────
echo.
echo [1/4] Backend sanal ortami olusturuluyor...
if not exist "backend\venv" (
    python -m venv backend\venv
    if errorlevel 1 (
        echo [HATA] venv olusturulamadi.
        pause & exit /b 1
    )
    echo [OK] venv olusturuldu
) else (
    echo [OK] venv zaten mevcut
)

:: ── Backend - Paketler ───────────────────────────────────────
echo.
echo [2/4] Backend paketleri yukleniyor (bu biraz sure alabilir)...
call backend\venv\Scripts\activate.bat
pip install -r backend\requirements.txt --quiet
if errorlevel 1 (
    echo [HATA] pip install basarisiz oldu.
    pause & exit /b 1
)
echo [OK] Backend paketleri yuklendi

:: ── Playwright ───────────────────────────────────────────────
echo.
echo [3/4] Playwright Chromium yukleniyor...
python -m playwright install chromium >nul 2>&1
if errorlevel 1 (
    echo [UYARI] Playwright yukleme basarisiz (manuel: playwright install chromium)
) else (
    echo [OK] Playwright Chromium yuklendi
)
call backend\venv\Scripts\deactivate.bat

:: ── Frontend - npm install ───────────────────────────────────
echo.
echo [4/4] Frontend paketleri yukleniyor...
cd frontend
call npm install --silent
if errorlevel 1 (
    echo [HATA] npm install basarisiz oldu.
    pause & exit /b 1
)
cd ..
echo [OK] Frontend paketleri yuklendi

:: ── Tamamlandi ───────────────────────────────────────────────
echo.
echo  ============================================
echo   Kurulum tamamlandi!
echo  ============================================
echo.
echo  Sonraki adimlar:
echo  1. .env dosyasini kontrol edin (DATABASE_URL dogru mu?)
echo  2. PostgreSQL'de veritabani olusturun:
echo       psql -U postgres -c "CREATE DATABASE merkamail;"
echo  3. start.bat ile uygulamayi baslatin
echo.
pause
