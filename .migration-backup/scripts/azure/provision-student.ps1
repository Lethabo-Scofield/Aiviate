[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SubscriptionId,
    [string]$ResourceGroupName = "aviate-rg",
    [string]$Location = "eastus",
    [string]$StaticWebAppName = "aviate-web",
    [string]$ApiPlanName = "aviate-api-plan",
    [string]$ApiAppName = "aviate-api",
    [string]$CallAgentPlanName = "aviate-api-plan",
    [string]$CallAgentAppName = "aviate-call-agent",
    [string]$WorkspaceName = "aviate-logs",
    [string]$ContainerEnvironmentName = "aviate-env",
    [string]$ContainerRegistryName = "aviateacr",
    [string]$ContainerAppName = "aviate-engine",
    [string]$ApiSku = "B1",
    [string]$CallAgentSku = "B1",
    [switch]$EnableAcrAdmin
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

function Get-AzCliExecutable {
    return Get-AzCliInvocation
}

function Invoke-AzureCli {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
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
    $script:AzCli = Get-AzCliExecutable
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

Ensure-AzureCli
if (-not $WhatIfPreference) {
    Ensure-LoggedIn
}

if ($SubscriptionId) {
    Invoke-AzureCli -Description "Set active Azure subscription" -Arguments @(
        "account", "set", "--subscription", $SubscriptionId
    )
}

Invoke-AzureCli -Description "Create resource group" -Arguments @(
    "group", "create", "--name", $ResourceGroupName, "--location", $Location
)

Invoke-AzureCli -Description "Register Microsoft.Web provider" -Arguments @(
    "provider", "register", "--namespace", "Microsoft.Web", "--wait"
)

Invoke-AzureCli -Description "Register Microsoft.OperationalInsights provider" -Arguments @(
    "provider", "register", "--namespace", "Microsoft.OperationalInsights", "--wait"
)

Invoke-AzureCli -Description "Register Microsoft.ContainerRegistry provider" -Arguments @(
    "provider", "register", "--namespace", "Microsoft.ContainerRegistry", "--wait"
)

Invoke-AzureCli -Description "Register Microsoft.App provider" -Arguments @(
    "provider", "register", "--namespace", "Microsoft.App", "--wait"
)

Invoke-AzureCli -Description "Create App Service plan for Flask API" -Arguments @(
    "appservice", "plan", "create", "--name", $ApiPlanName, "--resource-group", $ResourceGroupName, "--sku", $ApiSku, "--is-linux"
)

Invoke-AzureCli -Description "Create Flask API App Service" -Arguments @(
    "webapp", "create", "--resource-group", $ResourceGroupName, "--plan", $ApiPlanName, "--name", $ApiAppName, "--runtime", "PYTHON|3.11"
)

Invoke-AzureCli -Description "Configure Flask API startup command" -Arguments @(
    "webapp", "config", "set", "--resource-group", $ResourceGroupName, "--name", $ApiAppName, "--startup-file", "gunicorn wsgi:app --bind 0.0.0.0:`$PORT --workers 2 --timeout 120"
)

if ($CallAgentPlanName -ne $ApiPlanName) {
    Invoke-AzureCli -Description "Create App Service plan for Call Agent" -Arguments @(
        "appservice", "plan", "create", "--name", $CallAgentPlanName, "--resource-group", $ResourceGroupName, "--sku", $CallAgentSku, "--is-linux"
    )
}

Invoke-AzureCli -Description "Create Call Agent App Service" -Arguments @(
    "webapp", "create", "--resource-group", $ResourceGroupName, "--plan", $CallAgentPlanName, "--name", $CallAgentAppName, "--runtime", "NODE|22-lts"
)

Invoke-AzureCli -Description "Create Log Analytics workspace" -Arguments @(
    "monitor", "log-analytics", "workspace", "create", "--resource-group", $ResourceGroupName, "--workspace-name", $WorkspaceName, "--location", $Location
)

Invoke-AzureCli -Description "Create Azure Container Registry" -Arguments @(
    "acr", "create", "--resource-group", $ResourceGroupName, "--name", $ContainerRegistryName, "--sku", "Basic"
)

if ($EnableAcrAdmin.IsPresent) {
    Invoke-AzureCli -Description "Enable ACR admin user" -Arguments @(
        "acr", "update", "--name", $ContainerRegistryName, "--resource-group", $ResourceGroupName, "--admin-enabled", "true"
    )
}

Invoke-AzureCli -Description "Install Azure Container Apps CLI extension" -Arguments @(
    "extension", "add", "--name", "containerapp", "--upgrade", "--allow-preview", "true"
)

if (-not $WhatIfPreference) {
    $workspaceCommand = @($script:AzCli + @("monitor", "log-analytics", "workspace", "show", "--resource-group", $ResourceGroupName, "--workspace-name", $WorkspaceName, "--query", "customerId", "-o", "tsv"))
    $workspaceId = (& $workspaceCommand[0] $workspaceCommand[1..($workspaceCommand.Count - 1)]).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($workspaceId)) {
        throw "Could not resolve Log Analytics workspace ID for '$WorkspaceName'."
    }

    $workspaceKeyCommand = @($script:AzCli + @("monitor", "log-analytics", "workspace", "get-shared-keys", "--resource-group", $ResourceGroupName, "--workspace-name", $WorkspaceName, "--query", "primarySharedKey", "-o", "tsv"))
    $workspaceKey = (& $workspaceKeyCommand[0] $workspaceKeyCommand[1..($workspaceKeyCommand.Count - 1)]).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($workspaceKey)) {
        throw "Could not resolve Log Analytics workspace key for '$WorkspaceName'."
    }

    Invoke-AzureCli -Description "Create Azure Container Apps environment" -Arguments @(
        "containerapp", "env", "create", "--name", $ContainerEnvironmentName, "--resource-group", $ResourceGroupName, "--location", $Location, "--logs-workspace-id", $workspaceId, "--logs-workspace-key", $workspaceKey
    )
}
else {
    Invoke-AzureCli -Description "Create Azure Container Apps environment" -Arguments @(
        "containerapp", "env", "create", "--name", $ContainerEnvironmentName, "--resource-group", $ResourceGroupName, "--location", $Location, "--logs-workspace-id", "<workspace-id>", "--logs-workspace-key", "<workspace-key>"
    )
}

Write-Host ""
Write-Host "Provisioning complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create Static Web App '$StaticWebAppName' in the Azure Portal and connect it to GitHub."
Write-Host "2. Configure App Service settings for '$ApiAppName' and '$CallAgentAppName'."
Write-Host "3. Build and push the engine image, then create/update Container App '$ContainerAppName'."
Write-Host "4. Add GitHub Actions secrets and variables from docs/AZURE_DEPLOYMENT.md."
Write-Host ""
Write-Host "Helpful follow-up commands:" -ForegroundColor Yellow
Write-Host "- az webapp deployment list-publishing-profiles --resource-group $ResourceGroupName --name $ApiAppName"
Write-Host "- az webapp deployment list-publishing-profiles --resource-group $ResourceGroupName --name $CallAgentAppName"
Write-Host "- az acr credential show --resource-group $ResourceGroupName --name $ContainerRegistryName"
Write-Host "- az containerapp env show --resource-group $ResourceGroupName --name $ContainerEnvironmentName"