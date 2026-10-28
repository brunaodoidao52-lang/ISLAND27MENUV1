@echo off
rem Melody Generator (ISLAND27) - instala o VST3 para o FL Studio
net session >/dev/null 2>&1
if errorlevel 1 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set "SRC=%~dp0Melody Generator.vst3"
set "DEST=%CommonProgramFiles%\VST3"
if not exist "%SRC%" (
  echo Nao achei a pasta "Melody Generator.vst3" ao lado deste arquivo.
  echo Extraia o .rar inteiro antes de rodar o INSTALAR.bat.
  pause
  exit /b 1
)
if not exist "%DEST%" mkdir "%DEST%"
echo Copiando para "%DEST%\Melody Generator.vst3" ...
robocopy "%SRC%" "%DEST%\Melody Generator.vst3" /E /NFL /NDL /NJH /NJS /NP
if errorlevel 8 (
  echo Erro ao copiar. Feche o FL Studio e tente de novo.
  pause
  exit /b 1
)
echo.
echo Pronto! Agora no FL Studio: Options ^> Manage plugins ^> Find more plugins.
echo O plugin aparece como "Melody Generator" (gerador). Adicione no Channel Rack.
pause
