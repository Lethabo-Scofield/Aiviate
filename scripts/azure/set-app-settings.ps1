[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$EnvFilePath,
    [string]$SubscriptionId,
    [string]$ResourceGroupName = "aviate-rg",
    [string]$ApiAppName = "aviate-api",
    [string]$CallAgentAppName = "aviate-call-agent",
    [string]$ContainerAppName = "aviate-engine"
)

$ErrorActionPreference = "Stop"
$script:AzCli = $null

function Get-AzCliInvocation {
    $cmd = Get-Command az -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -like '*.exe') {
        return @($cmd.Source)
    }

    $pythonFallbacks = @(
        "C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe",
        "C:\Program Files (x86)\Microsoft SDKs\Azure\CLI2\python.exe"
    )

    foreach ($pythonPath in $pythonFallbacks) {
        if (Test-Path $pythonPath) {
            return @($pythonPath, "-m", "azure.cli")
        }
    }

    $cmdFallbacks = @(
        "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd",
        "C:\Program Files (x86)\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
    )

    foreach ($cmdPath in $cmdFallbacks) {
        if (Test-Path $cmdPath) {
            return @($cmdPath)
        }
    }

    return $null
}

function Invoke-AzureCli {
    param(
        [string[]]$Arguments,
        [string]$Description
    )

    $commandText = "az " + ($Arguments -join " ")
    if ($PSCmdlet.ShouldProcess($Description, $commandText)) {
        Write-Host "> $commandText" -ForegroundColor Cyan
        $invocation = @($script:AzCli + $Arguments)
        & $invocation[0] $invocation[1..($invocation.Count - 1)]
        if ($LASTEXITCODE -ne 0) {
            throw "Azure CLI command failed: $commandText"
        }
    }
}

function Ensure-AzureCli {
    $script:AzCli = Get-AzCliInvocation
    if (-not $script:AzCli) {
        throw "Azure CLI is required. Install it first, then rerun this script."
    }
}

function Ensure-LoggedIn {
    $invocation = @($script:AzCli + @("account", "show", "--output", "none"))
    & $invocation[0] $invocation[1..($invocation.Count - 1)] | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Run 'az login' first, then rerun this script."
    }
}

function Read-EnvFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }

    $map = @{}
    foreach ($line in Get-Content -Path $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split '=', 2
        if ($parts.Count -ne 2) {
            continue
        }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        $map[$key] = $value
    }

    return $map
}

function Convert-ToSettingsArray {
    param(
        [hashtable]$Values,
        [string[]]$Keys
    )

    $settings = @()
    foreach ($key in $Keys) {
        if ($Values.ContainsKey($key) -and $Values[$key] -ne "") {
            $settings += "${key}=$($Values[$key])"
        }
    }
    return $settings
}

function Set-WebAppSettings {
    param(
        [string]$AppName,
        [string[]]$Settings
    )

    if (-not $Settings -or $Settings.Count -eq 0) {
        Write-Host "No settings to apply for $AppName" -ForegroundColor Yellow
        return
    }

    if ($PSCmdlet.ShouldProcess($AppName, "Apply App Service settings")) {
        Invoke-AzureCli -Description "Apply App Service settings for $AppName" -Arguments (@(
            "webapp", "config", "appsettings", "set", "--resource-group", $ResourceGroupName, "--name", $AppName, "--settings"
        ) + $Settings)
    }
}

function Set-ContainerAppSettings {
    param([string[]]$Settings)

    if (-not $Settings -or $Settings.Count -eq 0) {
        Write-Host "No settings to apply for $ContainerAppName" -ForegroundColor Yellow
        return
    }

    if ($PSCmdlet.ShouldProcess($ContainerAppName, "Apply Container App settings")) {
        Invoke-AzureCli -Description "Apply Container App settings for $ContainerAppName" -Arguments (@(
            "containerapp", "update", "--resource-group", $ResourceGroupName, "--name", $ContainerAppName, "--set-env-vars"
        ) + $Settings)
    }
}

Ensure-AzureCli
Ensure-LoggedIn

if ($SubscriptionId) {
    Invoke-AzureCli -Description "Set active Azure subscription" -Arguments @(
        "account", "set", "--subscription", $SubscriptionId
    )
}

$values = Read-EnvFile -Path $EnvFilePath

$apiKeys = @(
    "DATABASE_URL",
    "NEON_DATABASE_URL",
    "JWT_SECRET",
    "ALLOWED_ORIGINS",
    "DB_CONNECT_TIMEOUT",
    "SKIP_DB_INIT",
    "ENGINE_URL",
    "AIVIATE_ENGINE_API_KEY",
    "AIVIATE_SERVICE_TOKEN",
    "MERCHANT_API_RATE_LIMIT_PER_MINUTE",
    "ORDERS_DATABASE_URL",
    "ORDERS_COMPANY_ID"
)

$callAgentKeys = @(
    "AIVIATE_API_URL",
    "AIVIATE_SERVICE_TOKEN",
    "CALL_AGENT_SIMULATION_MODE",
    "RETELL_API_KEY",
    "RETELL_AGENT_ID",
    "RETELL_FROM_NUMBER",
    "RETELL_WEBHOOK_SECRET"
)

$engineKeys = @(
    "AIVIATE_DATABASE_URL",
    "AIVIATE_ENVIRONMENT",
    "AIVIATE_GEOCODING_PROVIDER",
    "AIVIATE_NOMINATIM_BASE_URL",
    "AIVIATE_MATRIX_PROVIDER",
    "AIVIATE_OSRM_BASE_URL",
    "AIVIATE_PROVIDER_TIMEOUT_SECONDS",
    "AIVIATE_PROVIDER_MAX_RETRIES",
    "AIVIATE_JOBS_EAGER",
    "AIVIATE_SOLVER_TIME_LIMIT_SECONDS",
    "AIVIATE_RATE_LIMIT_PER_MINUTE",
    "AIVIATE_LOG_JSON"
)

$apiSettings = Convert-ToSettingsArray -Values $values -Keys $apiKeys
$callAgentSettings = Convert-ToSettingsArray -Values $values -Keys $callAgentKeys
$engineSettings = Convert-ToSettingsArray -Values $values -Keys $engineKeys

Set-WebAppSettings -AppName $ApiAppName -Settings $apiSettings
Set-WebAppSettings -AppName $CallAgentAppName -Settings $callAgentSettings
Set-ContainerAppSettings -Settings $engineSettings

Write-Host ""
Write-Host "App settings sync complete." -ForegroundColor Green
Write-Host "Review the frontend VITE_API_URL separately in Azure Static Web Apps configuration." -ForegroundColor Yellow