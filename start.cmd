@echo off
REM Start Iqra Quest locally. Double-click this file.
REM
REM Two servers, each in its own window — close a window to stop that server.
REM   8642  the app itself
REM   8700  the audio review page, which also saves the answers
REM
REM These are plain local servers: nothing is uploaded, and nothing here needs
REM Claude Code to be running.

cd /d "%~dp0"

echo Starting the app on http://localhost:8642 ...
start "Iqra Quest - app" cmd /k python -m http.server 8642 --directory app

echo Starting the audio review on http://localhost:8700/review_audio.html ...
start "Iqra Quest - audio review" cmd /k python pipeline\review_server.py

REM give the servers a moment before the browser asks for the page
timeout /t 2 /nobreak >nul
start "" http://localhost:8642/

echo.
echo   App           http://localhost:8642/
echo   Audio review  http://localhost:8700/review_audio.html
echo.
echo Leave the two new windows open while you use it.
timeout /t 6 /nobreak >nul
