@echo off
setlocal
cd /d "%~dp0..\Blockchain"

echo ===============================================
echo   CareQuest bridge -> MST Blockchain testnet
echo ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. ArkCare already uses Node for the frontend.
  exit /b 1
)

if not exist node_modules (
  echo Installing blockchain dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "..\arkcare.env" (
  echo [ERROR] ..\arkcare.env not found.
  echo The bridge needs BRIDGEKEY_PRIVATE_KEY from it to sign transactions.
  echo Copy arkcare.env.example to ..\arkcare.env and fill in the key.
  exit /b 1
)

if not exist runtime\deployment.json (
  if exist runtime\deployment.mst.json (
    echo Restoring the MST deployment record...
    move /y runtime\deployment.mst.json runtime\deployment.json >nul
  ) else (
    echo [ERROR] runtime\deployment.json not found.
    echo Deploy the contracts first:
    echo     cd Blockchain ^&^& npm run deploy:mst
    exit /b 1
  )
)

echo Starting bridge on 127.0.0.1:8546...
echo The frontend reads CAREQUEST_BLOCKCHAIN_BRIDGE_URL from ..\arkcare.env
echo Keep this window open during the demo. Ctrl+C to stop.
echo.
node bridge-server.js
