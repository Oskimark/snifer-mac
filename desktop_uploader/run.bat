@echo off
title Snifer Desktop Uploader
echo Instalando dependencias (solo la primera vez)...
call npm install
cls
echo ==========================================
echo    SNIFER DESKTOP UPLOADER
echo ==========================================
echo Ejecutando...
node index.js
pause
