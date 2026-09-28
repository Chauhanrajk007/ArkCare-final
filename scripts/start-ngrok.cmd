@echo off
setlocal enabledelayedexpansion
rem ============================================================================
rem  start-ngrok.cmd - expose the local ArkCare frontend over HTTPS via ngrok,
rem  and point NEXT_PUBLIC_APP_URL at the tunnel so Agora, sockets and the
rem  Razorpay/QStash callbacks resolve to the public URL.
rem
rem  Usage:
rem    scripts\start-ngrok.cmd            start the tunnel, print + record the URL
rem    scripts\start-ngrok.cmd --stop     stop the tunnel only
rem    scripts\start-ngrok.cmd --status   show the current tunnel URL
rem
rem  Only port 3000 is exposed. The CareQuest bridge (:8546) stays on loopback
rem  and is never tunnelled - the signing key must not leave this machine.
rem ============================================================================

set "ROOT=%~dp0.."
set "ENVFILE=%ROOT%\Frontend\.env.local"
set "NGROK=http://127.0.0.1:4040"
set "WEBPORT=3000"

if /i "%~1"=="--stop" goto :stop
if /i "%~1"=="--status" goto :status

rem ---------------------------------------------------------------- preflight
where ngrok >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ngrok is not on PATH.
  echo Install it:  winget install ngrok.ngrok
  echo then:        ngrok config add-authtoken ^<YOUR_TOKEN^>
  exit /b 1
)

where npx >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npx not found. Node.js 20+ is required.
  exit /b 1
)

rem The frontend has to be up before a tunnel to it means anything.
powershell -NoProfile -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%WEBPORT%' -UseBasicParsing -TimeoutSec 4; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [ERROR] Nothing answering on http://127.0.0.1:%WEBPORT%
  echo Start the app first:  scripts\start-mst-bridge.cmd  (in one window)
  echo                      cd Frontend ^&^& npm run dev        (in another)
  exit /b 1
)

rem ------------------------------------------------------------------- start
echo Starting ngrok tunnel to 127.0.0.1:%WEBPORT% ...
start "ArkCare ngrok" /min cmd /c "ngrok http %WEBPORT% --log=stdout"
timeout /t 6 /nobreak >nul

set "PUBLICURL="
for /l %%i in (1,1,20) do (
  if not defined PUBLICURL (
    for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command ^
      "try { (Invoke-RestMethod -Uri '%NGROK%/api/tunnels' -TimeoutSec 4) ^
             .tunnels ^| Where-Object { $_.public_url -like 'https://*' } ^
             ^| Select-Object -First 1 -ExpandProperty public_url } catch { '' }"`) do (
      set "PUBLICURL=%%u"
    )
    if not defined PUBLICURL timeout /t 2 /nobreak >nul
  )
)

if not defined PUBLICURL (
  echo [ERROR] Could not read the public URL from the ngrok API on %NGROK%
  echo Check that the ngrok agent is running and authenticated.
  exit /b 1
)

rem ------------------------------------------- record it for the Next.js build
rem NEXT_PUBLIC_* values are inlined at build time, so this has to be written
rem BEFORE `next build` / `next dev` is (re)started to take effect.
if not exist "%ENVFILE%" (
  >"%ENVFILE%" echo # Written by scripts\start-ngrok.cmd on %DATE% %TIME%
)
findstr /b /c:"NEXT_PUBLIC_APP_URL=" "%ENVFILE%" >nul 2>nul
if errorlevel 1 (
  >>"%ENVFILE%" echo NEXT_PUBLIC_APP_URL=%PUBLICURL%
) else (
  powershell -NoProfile -Command ^
    "$f='%ENVFILE%'; (Get-Content $f) -replace '^NEXT_PUBLIC_APP_URL=.*$', 'NEXT_PUBLIC_APP_URL=%PUBLICURL%' ^| Set-Content $f"
)

echo.
echo ===========================================================
echo   ArkCare is public at:
echo.
echo     %PUBLICURL%
echo.
echo   Written to Frontend\.env.local as NEXT_PUBLIC_APP_URL.
echo   RESTART the frontend (npm run dev / npm run build) for it
echo   to take effect - NEXT_PUBLIC_* is inlined at build time.
echo.
echo   Demo logins (password DemoOnly!123^):
echo     patient          demo.patient@arkcare.local
echo     doctor           demo.doctor@arkcare.local
echo     hospital admin   demo.hospital_admin@arkcare.local
echo     platform admin   demo.platform_admin@arkcare.local
echo.
echo   The blockchain bridge stays on 127.0.0.1:%WEBPORT%+1 and is NOT exposed.
echo   Stop the tunnel with:  scripts\start-ngrok.cmd --stop
echo ===========================================================
echo.
goto :eof

rem -------------------------------------------------------------------- stop
:stop
echo Stopping ngrok ...
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command ^
  "try { (Invoke-RestMethod -Uri '%NGROK%/api/tunnels' -TimeoutSec 4) ^
         .tunnels ^| ForEach-Object { $_.proto + ' ' + $_.config.addr } } catch { '' }"`) do (
  echo   %%p
  for /f "tokens=1,2" %%a in ("%%p") do (
    powershell -NoProfile -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort %%b -State Listen -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue"
  )
)
echo Done.
goto :eof

rem ------------------------------------------------------------------ status
:status
powershell -NoProfile -Command ^
  "try { (Invoke-RestMethod -Uri '%NGROK%/api/tunnels' -TimeoutSec 4) ^
         .tunnels ^| ForEach-Object { Write-Host ($_.public_url + '  ->  ' + $_.config.addr) } } catch { Write-Host 'No tunnel running.' }"
goto :eof
