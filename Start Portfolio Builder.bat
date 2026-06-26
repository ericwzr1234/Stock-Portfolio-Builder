@echo off
title Portfolio Builder
cd /d "%~dp0"
echo ============================================================
echo    Portfolio Builder  -  free, local, no accounts
echo.
echo    A browser tab will open automatically in a few seconds.
echo    Keep THIS window open while you use the tool.
echo    To stop:  close this window  (or press Ctrl+C).
echo ============================================================
echo.

where py >nul 2>nul && goto runpy
where python >nul 2>nul && goto runpython

echo  ERROR: Python was not found on this PC.
echo.
echo  Install it (free) from   https://www.python.org/downloads/
echo  IMPORTANT: on the first install screen, TICK the box
echo  "Add Python to PATH", finish, then run this file again.
echo.
pause
goto end

:runpy
py -3 server.py
goto stopped

:runpython
python server.py
goto stopped

:stopped
echo.
echo Server stopped - your portfolio is saved in portfolio.json
echo You can close this window.
pause

:end
