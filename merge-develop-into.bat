@echo off
REM ====================================================
REM Merge helper for ITM.MCP repo (no branch switching)
REM Usage:
REM   merge-develop-into.bat stage   (deploy develop -> stage)
REM   merge-develop-into.bat main    (deploy develop -> main)
REM ====================================================

IF "%1"=="" (
  echo Usage: %0 ^<stage^|main^>
  exit /b 1
)

SET TARGET=%1

REM Ensure we're inside a Git repo and on 'develop'
git rev-parse --is-inside-work-tree >nul 2>&1
IF ERRORLEVEL 1 (
  echo Not a git repository. Run this from the repo root.
  exit /b 1
)

FOR /F "usebackq tokens=*" %%b IN (`git rev-parse --abbrev-ref HEAD`) DO SET CURR=%%b
IF /I NOT "%CURR%"=="develop" (
  echo You must be on branch 'develop' to run this script. Current: %CURR%
  exit /b 1
)

echo.
echo ===========================================
echo Deploying from develop to %TARGET% ...
echo ===========================================
echo.

git fetch origin

IF /I "%TARGET%"=="stage" (
  echo Pushing develop ^> stage ...
  git push origin develop:stage
  GOTO done
)

IF /I "%TARGET%"=="main" (
  echo Pushing develop ^> main ...
  git push origin develop:main
  GOTO done
)

echo Invalid target branch: %TARGET%
echo Use "stage" or "main"
exit /b 1

:done
echo.
echo Done.
