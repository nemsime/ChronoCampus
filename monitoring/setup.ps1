$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $PSScriptRoot 'secrets'
New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
$randomSource = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    foreach ($secretName in @('metrics_token', 'grafana_password')) {
        $secretPath = Join-Path $secretDirectory $secretName
        if (-not (Test-Path -LiteralPath $secretPath)) {
            $randomBytes = New-Object byte[] 32
            $randomSource.GetBytes($randomBytes)
            [System.IO.File]::WriteAllText($secretPath, [Convert]::ToBase64String($randomBytes), [System.Text.UTF8Encoding]::new($false))
        }
    }
} finally { $randomSource.Dispose() }
$settingsPath = Join-Path $projectDirectory 'backend\.env'
$tokenPath = (Join-Path $secretDirectory 'metrics_token').Replace('\', '/')
if (-not (Test-Path -LiteralPath $settingsPath)) { throw 'Configure backend/.env first.' }
$settingsText = [System.IO.File]::ReadAllText($settingsPath)
if ($settingsText -notmatch '(?m)^METRICS_TOKEN_FILE=') {
    [System.IO.File]::AppendAllText($settingsPath, "`nMETRICS_TOKEN_FILE=$tokenPath`n", [System.Text.UTF8Encoding]::new($false))
}
Write-Output 'Monitoring secrets are ready. Restart the backend, then run docker compose -f monitoring/compose.yaml up -d.'
Write-Output 'Grafana: http://localhost:3001, user admin; password is in monitoring/secrets/grafana_password.'
