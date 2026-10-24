param([ValidateSet('start', 'status', 'stop', 'init-mail-key', 'rotate-mail-key')][string]$Command = 'status')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExecutable = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExecutable)) {
    throw 'Backend environment is missing. Install the README prerequisites first.'
}
Push-Location (Join-Path $projectRoot 'backend')
try {
    & $pythonExecutable -m app.local_runtime $Command
    $resultCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $resultCode
