@echo off
echo Dang khoi dong Quiz PWA...

:: Kiem tra Python
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Server: http://localhost:8080
    start "" "http://localhost:8080"
    python -m http.server 8080
    goto end
)

:: Fallback: Node http-server
npx http-server -p 8080 -o >nul 2>&1
if %errorlevel% == 0 goto end

echo.
echo [LOI] Khong tim thay Python hoac Node.js.
echo Cai Python tai: https://python.org
pause

:end
