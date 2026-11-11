@echo off
setlocal

REM Per-repository settings
set sourceBranch=develop
set validDestinations=stage main
REM Optional second remote that receives the same commit when main is updated
set mirrorRemote=github

REM Check if the destination parameter is provided
if "%1"=="" (
    echo Usage: merge-develop-into.bat [destination]
    echo Allowed destinations: %validDestinations%
    echo Merges origin/develop into the destination branch and pushes it.
    echo The merge runs in a temporary worktree, so this checkout never changes branch.
    exit /b 1
)

REM Set destination branch
set destinationBranch=%1

REM Validate the destination branch
set valid=0
for %%d in (%validDestinations%) do (
    if /i "%%d"=="%destinationBranch%" set valid=1
)

if %valid%==0 (
    echo Invalid destination branch: %destinationBranch%
    echo Allowed destinations: %validDestinations%
    exit /b 1
)

for %%I in (.) do set repoName=%%~nxI
set mergeDir=%TEMP%\merge-%repoName%-%destinationBranch%

echo Merging %sourceBranch% into %destinationBranch%...

git fetch origin
if errorlevel 1 (
    echo Fetch failed.
    exit /b 1
)

REM A leftover worktree may hold an unfinished conflict resolution, so never discard it
git worktree prune
if exist "%mergeDir%" (
    echo A previous merge worktree exists at %mergeDir%.
    echo Finish and push it, or remove it with: git worktree remove --force "%mergeDir%"
    exit /b 1
)

git worktree add --detach "%mergeDir%" origin/%destinationBranch%
if errorlevel 1 (
    echo Failed to create the merge worktree at %mergeDir%.
    exit /b 1
)

git -C "%mergeDir%" merge origin/%sourceBranch% -m "Merge branch '%sourceBranch%' into %destinationBranch%"
if errorlevel 1 (
    echo.
    echo *** MERGE CONFLICT ***
    echo Resolve the conflicts in %mergeDir%, commit, then run:
    echo   git -C "%mergeDir%" push origin HEAD:%destinationBranch%
    echo   git worktree remove "%mergeDir%"
    exit /b 1
)

git -C "%mergeDir%" push origin HEAD:%destinationBranch%
if errorlevel 1 (
    echo Push failed. The merge is kept in %mergeDir%.
    exit /b 1
)

git worktree remove "%mergeDir%"
echo Merge successful. %sourceBranch% has been merged into %destinationBranch%.

if not defined mirrorRemote goto :done
if /i not "%destinationBranch%"=="main" goto :done
REM The mirror is public. It receives one commit holding the files of origin/main on top of its own
REM history, never origin's history, so material removed from the tree stays private.
git fetch %mirrorRemote%
if errorlevel 1 (
    echo Fetch from %mirrorRemote% failed. origin/main is updated, %mirrorRemote%/main is not.
    exit /b 1
)
for %%p in (zz_Tickets zz_Specifications) do (
    git cat-file -e origin/main:%%p 2>nul && (
        echo origin/main tracks %%p, which must never reach %mirrorRemote%. Nothing was pushed to %mirrorRemote%.
        exit /b 1
    )
)
set snapshotCommit=
for /f %%t in ('git log -1 --format^=%%T origin/main') do set snapshotTree=%%t
for /f %%s in ('git rev-parse --short origin/main') do set sourceShort=%%s
for /f %%c in ('git commit-tree %snapshotTree% -p %mirrorRemote%/main -m "Release from origin/main %sourceShort%"') do set snapshotCommit=%%c
if not defined snapshotCommit (
    echo Could not build the snapshot commit. origin/main is updated, %mirrorRemote%/main is not.
    exit /b 1
)
echo Publishing the files of origin/main %sourceShort% to %mirrorRemote%/main as %snapshotCommit%...
git push %mirrorRemote% %snapshotCommit%:refs/heads/main
if errorlevel 1 (
    echo Push to %mirrorRemote% failed. origin/main is updated, %mirrorRemote%/main is not.
    echo Rerun the snapshot step: fetch %mirrorRemote%, then push a commit-tree of origin/main on top of %mirrorRemote%/main.
    exit /b 1
)

:done
endlocal
