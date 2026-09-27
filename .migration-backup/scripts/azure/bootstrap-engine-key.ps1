[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$EnvFilePath,
    [string]$OrganisationName = "Aiviate Production",
    [string]$EnginePath = "Website/aiviate-engine"
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }

    $map = [ordered]@{}
    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split '=', 2
        if ($parts.Count -ne 2) {
            continue
        }

        $map[$parts[0].Trim()] = $parts[1].Trim()
    }

    return $map
}

function Set-ProcessEnvironment {
    param([System.Collections.IDictionary]$Values)

    foreach ($entry in $Values.GetEnumerator()) {
        if ($entry.Key -like 'AIVIATE_*') {
            [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
        }
    }
}

function Update-EnvFileValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Value
    )

    $lines = Get-Content -Path $Path
    $updated = $false

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$([regex]::Escape($Key))=") {
            $lines[$i] = "$Key=$Value"
            $updated = $true
            break
        }
    }

    if (-not $updated) {
        $lines += "$Key=$Value"
    }

    Set-Content -Path $Path -Value $lines
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python is required to bootstrap the engine key."
}

$values = Read-EnvFile -Path $EnvFilePath
Set-ProcessEnvironment -Values $values

if (-not $values.Contains("AIVIATE_DATABASE_URL") -or [string]::IsNullOrWhiteSpace($values["AIVIATE_DATABASE_URL"])) {
    throw "AIVIATE_DATABASE_URL must be set in $EnvFilePath before bootstrapping the engine."
}

Push-Location $EnginePath
try {
    $output = python -m aiviate.bootstrap --name "$OrganisationName" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $output | ForEach-Object { Write-Host $_ }
        throw "Engine bootstrap failed."
    }
}
finally {
    Pop-Location
}

$adminLine = $output | Where-Object { $_ -match '^api key \[admin\]:\s+(.+)$' } | Select-Object -First 1
if (-not $adminLine) {
    $output | ForEach-Object { Write-Host $_ }
    throw "Bootstrap completed but the admin engine key was not found in output."
}

$engineKey = [regex]::Match($adminLine, '^api key \[admin\]:\s+(.+)$').Groups[1].Value.Trim()
if (-not $engineKey) {
    throw "Extracted engine key is empty."
}

Update-EnvFileValue -Path $EnvFilePath -Key 'AIVIATE_ENGINE_API_KEY' -Value $engineKey

Write-Host "Engine bootstrap complete." -ForegroundColor Green
Write-Host "AIVIATE_ENGINE_API_KEY has been written to $EnvFilePath" -ForegroundColor Yellow
Write-Host "Next: run .\scripts\azure\set-app-settings.ps1 -EnvFilePath $EnvFilePath" -ForegroundColor Yellow