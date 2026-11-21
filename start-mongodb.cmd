@echo off
rem Ajrasakha - start local MongoDB (single-node replica set, stored in your user folder)
set "MONGO=%LOCALAPPDATA%\Programs\mongodb\bin\mongod.exe"
set "DBPATH=%LOCALAPPDATA%\mongodb-data"
if not exist "%MONGO%" (
  echo [Ajrasakha] MongoDB not found at %MONGO%
  pause
  exit /b 1
)
echo [Ajrasakha] Starting MongoDB on mongodb://127.0.0.1:27017 (replSet rs0) ...
"%MONGO%" --dbpath "%DBPATH%" --port 27017 --replSet rs0 --bind_ip 127.0.0.1
