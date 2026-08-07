# Azure Deployment Guide

This guide maps the current monorepo to Azure services that fit an Azure for Students account and the code that already exists in this repository.

## What To Deploy

Deploy these as separate Azure services:

| Service | Path | Runtime | Azure target |
| --- | --- | --- | --- |
| Admin web frontend | `Website/` | React + Vite static build | Azure Static Web Apps |
| Main API | `Website/backend/` | Python Flask | Azure App Service (Linux, Python 3.11) |
| Decision engine | `Website/aiviate-engine/` | Python FastAPI + Docker | Azure Container Apps |
| Call Agent backend | `Call Agent/Backend/` | Node.js + Express | Azure App Service (Linux, Node 22 LTS) |
| Driver app | `App/` | Expo React Native | Do not host on Azure; distribute with Expo/EAS |

Do not deploy `Call Agent/Frontend/`. The existing deployment notes already mark it as a deprecated local prototype.

## Azure For Students Notes

- Use low-cost SKUs only.
- Prefer one resource group for everything in the first deployment.
- Keep Neon or your current external Postgres if you already have it. Azure Database for PostgreSQL can consume student credits quickly.
- Start with manual deployment from GitHub or local ZIP pushes. Move to CI/CD only after the first successful release.

## Prerequisites

1. Create or sign in to your Azure account.
2. Install Azure CLI: `az --version`
3. Install Node.js 20+, Python 3.11, and Docker Desktop.
4. Ensure you can build each service locally.
5. Have production secrets ready.

## Recommended Resource Layout

Use one resource group, for example:

```bash
az login
az account show --output table
az group create --name aviate-rg --location eastus
```

Recommended service names:

- Static Web App: `aviate-web`
- API App Service: `aviate-api`
- Engine Container App: `aviate-engine`
- Call Agent App Service: `aviate-call-agent`
- Log Analytics workspace: `aviate-logs`
- Container Apps environment: `aviate-env`

For Azure for Students or any subscription with tight App Service quota, host both `aviate-api` and `aviate-call-agent` on the same Linux App Service plan. The provisioning script now does this by default to avoid needing a second Basic plan quota allocation.

## Step 1: Prepare Production Environment Values

You will need these values before deployment.

### Website backend

```text
DATABASE_URL=
NEON_DATABASE_URL=
JWT_SECRET=
ALLOWED_ORIGINS=
DB_CONNECT_TIMEOUT=10
SKIP_DB_INIT=true
ENGINE_URL=
AIVIATE_ENGINE_API_KEY=
AIVIATE_SERVICE_TOKEN=
MERCHANT_API_RATE_LIMIT_PER_MINUTE=120
```

### Decision engine

Read `Website/aiviate-engine/README.md` and prepare the `AIVIATE_*` values it requires.

### Call Agent backend

```text
AIVIATE_API_URL=https://your-api-hostname.azurewebsites.net
AIVIATE_SERVICE_TOKEN=
CALL_AGENT_SIMULATION_MODE=true
RETELL_API_KEY=
RETELL_AGENT_ID=
RETELL_FROM_NUMBER=
RETELL_WEBHOOK_SECRET=
```

## Step 2: Validate Locally Before Azure

Run these commands from the repository root.

### Frontend

```bash
cd Website
npm ci
npm run build
```

### Flask API

```bash
cd Website/backend
pip install -r requirements.txt
python -m py_compile app.py models.py routes/orders.py routes/support.py wsgi.py
```

### Decision engine

```bash
cd Website/aiviate-engine
python -m pip install -e ".[postgres]"
python -m pytest -q tests/unit/test_order_validation.py tests/unit/test_clustering.py
docker build -t aviate-engine .
```

### Call Agent backend

```bash
cd "Call Agent/Backend"
npm ci
node --check server.js
node --check routes/tools.js
node --check routes/calls.js
node --check routes/webhooks.js
node --check services/aiviateClient.js
```

## Step 3: Deploy The Admin Web Frontend To Azure Static Web Apps

This is the best fit for `Website/` because it is a Vite static build.

1. In Azure Portal, create a Static Web App.
2. Choose your subscription and the `aviate-rg` resource group.
3. Pick a close region.
4. Connect your GitHub repository.
5. Set:

```text
App location: Website
Api location: leave blank
Output location: dist
```

6. After creation, Azure adds a GitHub Actions workflow.
7. In the Static Web App configuration, add:

```text
VITE_API_URL=https://aviate-api.azurewebsites.net/api
```

8. Commit to your main branch and let GitHub Actions publish the site.

### Custom domain setup

If you want a branded URL instead of the Azure-generated one:

1. In the Static Web App, add your custom domain in Azure.
2. Point the domain's DNS CNAME to the Static Web App hostname Azure gives you.
3. Add the custom domain to the API app's `ALLOWED_ORIGINS` alongside the Static Web App host.
4. Keep `VITE_API_URL` pointing at `https://aviate-api.azurewebsites.net/api` unless you also put the API behind the same branded domain.

Example:

```text
ALLOWED_ORIGINS="https://your-brand.com,https://www.your-brand.com,https://aviate-web.azurestaticapps.net"
```

This keeps the site reachable on different devices because the frontend stays public and the API URL is absolute, so the browser does not depend on local machine routing.

Alternative: if GitHub integration is blocked, run `npm run build` in `Website/` and deploy the `dist/` folder manually using the portal or Azure Static Web Apps CLI.

## Step 4: Deploy The Flask API To Azure App Service

This service should be split from the frontend for Azure. The Vercel combined setup in `Website/vercel.json` is not the right Azure shape.

### Create the App Service

```bash
az appservice plan create \
  --name aviate-api-plan \
  --resource-group aviate-rg \
  --sku B1 \
  --is-linux

az webapp create \
  --resource-group aviate-rg \
  --plan aviate-api-plan \
  --name aviate-api \
  --runtime "PYTHON|3.11"
```

### Configure startup command

Set the startup command to the same entrypoint already documented in the repo:

```bash
az webapp config set \
  --resource-group aviate-rg \
  --name aviate-api \
  --startup-file "gunicorn wsgi:app --bind 0.0.0.0:\$PORT --workers 2 --timeout 120"
```

### Configure app settings

```bash
az webapp config appsettings set \
  --resource-group aviate-rg \
  --name aviate-api \
  --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    NEON_DATABASE_URL="<your-neon-url>" \
    JWT_SECRET="<your-secret>" \
    ALLOWED_ORIGINS="https://<your-static-web-app-domain>" \
    DB_CONNECT_TIMEOUT=10 \
    SKIP_DB_INIT=true \
    ENGINE_URL="https://aviate-engine.<region>.azurecontainerapps.io" \
    AIVIATE_ENGINE_API_KEY="<engine-api-key>" \
    AIVIATE_SERVICE_TOKEN="<shared-service-token>" \
    MERCHANT_API_RATE_LIMIT_PER_MINUTE=120
```

### Deploy code

Simplest first release:

1. In Azure Portal, open the App Service.
2. Use Deployment Center with GitHub.
3. Point it to this repository.
4. Set the app path to `Website/backend` if using a workflow that supports subfolders.

If your workflow cannot target a subfolder cleanly, deploy with ZIP from inside `Website/backend`:

```bash
cd Website/backend
Compress-Archive -Path * -DestinationPath api.zip -Force
az webapp deploy --resource-group aviate-rg --name aviate-api --src-path api.zip --type zip
```

After deploy, test:

```bash
curl https://aviate-api.azurewebsites.net/
curl https://aviate-api.azurewebsites.net/api/integrations/health
```

## Step 5: Deploy The Decision Engine To Azure Container Apps

This service already has a Dockerfile, which makes Container Apps the cleanest Azure target.

### Create supporting Azure resources

```bash
az extension add --name containerapp

az monitor log-analytics workspace create \
  --resource-group aviate-rg \
  --workspace-name aviate-logs

$logAnalyticsId = az monitor log-analytics workspace show \
  --resource-group aviate-rg \
  --workspace-name aviate-logs \
  --query customerId -o tsv

$logAnalyticsKey = az monitor log-analytics workspace get-shared-keys \
  --resource-group aviate-rg \
  --workspace-name aviate-logs \
  --query primarySharedKey -o tsv

az containerapp env create \
  --name aviate-env \
  --resource-group aviate-rg \
  --location eastus \
  --logs-workspace-id $logAnalyticsId \
  --logs-workspace-key $logAnalyticsKey
```

### Create an Azure Container Registry

```bash
az acr create --resource-group aviate-rg --name aviateacr --sku Basic
az acr login --name aviateacr
```

### Build and push the image

```bash
cd Website/aiviate-engine
docker build -t aviateacr.azurecr.io/aiviate-engine:latest .
docker push aviateacr.azurecr.io/aiviate-engine:latest
```

### Create the Container App

```bash
az containerapp create \
  --name aviate-engine \
  --resource-group aviate-rg \
  --environment aviate-env \
  --image aviateacr.azurecr.io/aiviate-engine:latest \
  --target-port 8000 \
  --ingress external \
  --registry-server aviateacr.azurecr.io \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 0 \
  --max-replicas 1
```

### Set secrets and environment variables

```bash
az containerapp update \
  --name aviate-engine \
  --resource-group aviate-rg \
  --set-env-vars \
    AIVIATE_DATABASE_URL="<engine-db-url>"
```

Then bootstrap the engine database to generate API keys, put one generated admin or dispatcher key into the Flask API `AIVIATE_ENGINE_API_KEY` setting, and set the public engine URL in the Flask API `ENGINE_URL` setting.

## Step 6: Deploy The Call Agent Backend To Azure App Service

The backend is a small Express service and can run on its own App Service.

### Create the app

```bash
az webapp create \
  --resource-group aviate-rg \
  --plan aviate-api-plan \
  --name aviate-call-agent \
  --runtime "NODE|22-lts"
```

If your subscription has enough quota and you want the Call Agent isolated on its own plan, you can still create a separate `aviate-call-plan`. For first deployment on a student subscription, reuse `aviate-api-plan`.

### Configure settings

```bash
az webapp config appsettings set \
  --resource-group aviate-rg \
  --name aviate-call-agent \
  --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    AIVIATE_API_URL="https://aviate-api.azurewebsites.net" \
    AIVIATE_SERVICE_TOKEN="<shared-service-token>" \
    CALL_AGENT_SIMULATION_MODE=true \
    RETELL_API_KEY="<retell-key>" \
    RETELL_AGENT_ID="<retell-agent-id>" \
    RETELL_FROM_NUMBER="<retell-number>" \
    RETELL_WEBHOOK_SECRET="<retell-webhook-secret>"
```

### Deploy code

```bash
cd "Call Agent/Backend"
Compress-Archive -Path * -DestinationPath call-agent.zip -Force
az webapp deploy --resource-group aviate-rg --name aviate-call-agent --src-path call-agent.zip --type zip
```

### Test endpoints

```bash
curl https://aviate-call-agent.azurewebsites.net/health
curl -X POST https://aviate-call-agent.azurewebsites.net/internal/v1/calls
```

Leave `CALL_AGENT_SIMULATION_MODE=true` until Retell webhook signing and live telephony are fully verified.

## Step 7: Connect The Services Together

After all services are live, verify this dependency chain:

1. Frontend calls `VITE_API_URL`.
2. Flask API can reach `ENGINE_URL` over HTTPS.
3. Call Agent can reach `AIVIATE_API_URL`.
4. Flask API and Call Agent share the same `AIVIATE_SERVICE_TOKEN`.
5. `ALLOWED_ORIGINS` contains the Static Web App production domain.

## Step 8: Production Checks After Deployment

Run these checks in order:

1. Open the frontend and log in.
2. Hit the Flask API health or root endpoint.
3. Test merchant integration endpoints.
4. Trigger one route optimization request and confirm the Flask API reaches the engine.
5. Call `GET /health` on the Call Agent backend.
6. Test one simulated call flow.

## What Not To Host On Azure Right Now

- `App/` is an Expo mobile app. Build and distribute it with Expo/EAS, not Azure hosting.
- `Call Agent/Frontend/` is deprecated and should not be published.
- `DEVICE/` is documentation only.

## Lowest-Risk Deployment Order

1. Deploy `Website/backend` first.
2. Deploy `Website/` frontend and point `VITE_API_URL` to the API.
3. Deploy `Website/aiviate-engine` and set `ENGINE_URL` in the API.
4. Deploy `Call Agent/Backend` last.

## Common Azure Pitfalls For This Repo

- Do not try to deploy the whole monorepo as one Azure app.
- Do not deploy the Vercel root shape directly to Azure without splitting frontend and backend.
- Do not hard-code localhost URLs in production environment values.
- Do not use `*` for `ALLOWED_ORIGINS` in production.
- Do not expose engine or Retell secrets in frontend variables.

## Suggested Next Step

Start with the Flask API deployment first. Once `aviate-api` is live, the frontend, engine, and Call Agent setup becomes much easier because their environment values can point to a stable API URL.

## GitHub Actions Setup

This repository now includes Azure deployment workflows under `.github/workflows/` for each deployable service.

### Workflows included

- `azure-static-webapp.yml` deploys `Website/` to Azure Static Web Apps.
- `azure-api-webapp.yml` deploys `Website/backend/` to Azure App Service.
- `azure-engine-containerapp.yml` builds and pushes `Website/aiviate-engine/` and updates Azure Container Apps.
- `azure-call-agent-webapp.yml` deploys `Call Agent/Backend/` to Azure App Service.

### GitHub repository secrets to add

Add these in GitHub: Settings -> Secrets and variables -> Actions.

```text
AZURE_STATIC_WEB_APPS_API_TOKEN
AZURE_WEBAPP_PUBLISH_PROFILE_API
AZURE_WEBAPP_PUBLISH_PROFILE_CALL_AGENT
AZURE_CREDENTIALS
AZURE_CONTAINER_REGISTRY_PASSWORD
AZURE_CONTAINER_APP_RESOURCE_GROUP
```

Notes:

- `AZURE_STATIC_WEB_APPS_API_TOKEN` comes from the Static Web App deployment token.
- `AZURE_WEBAPP_PUBLISH_PROFILE_API` and `AZURE_WEBAPP_PUBLISH_PROFILE_CALL_AGENT` come from the respective App Service publish profiles.
- `AZURE_CREDENTIALS` is a service principal JSON used by the Container Apps workflow.
- `AZURE_CONTAINER_REGISTRY_PASSWORD` should be the Azure Container Registry admin password, or replace this flow with federated identity later.
- `AZURE_CONTAINER_APP_RESOURCE_GROUP` is stored as a secret here so you can reuse the workflow safely across forks without exposing naming assumptions.

### GitHub repository variables to add

Add these as repository variables.

```text
AZURE_API_APP_NAME=aviate-api
AZURE_CALL_AGENT_APP_NAME=aviate-call-agent
AZURE_CONTAINER_APP_NAME=aviate-engine
AZURE_CONTAINER_REGISTRY=aviateacr.azurecr.io
AZURE_CONTAINER_REGISTRY_USERNAME=aviateacr
AZURE_ENGINE_IMAGE_NAME=aiviate-engine
```

### First-time Azure hookup steps

1. Create the Azure resources first using the earlier sections in this document.
2. Download the publish profile for each App Service and add it to GitHub Secrets.
3. Copy the Static Web App deployment token into GitHub Secrets.
4. Create a service principal for GitHub Actions to update Container Apps:

```bash
az ad sp create-for-rbac \
  --name aviate-github-actions \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/aviate-rg \
  --json-auth
```

5. Save the JSON output as the `AZURE_CREDENTIALS` GitHub secret.
6. Enable the admin user on Azure Container Registry if you want to use the included username/password push flow.
7. Run each workflow manually once with `workflow_dispatch` after the secrets and variables are set.

## Provisioning Script

If you want to create the base Azure resources from Windows PowerShell instead of copying commands one by one, use:

```powershell
.\scripts\azure\provision-student.ps1
```

Example with explicit names:

```powershell
.\scripts\azure\provision-student.ps1 `
  -ResourceGroupName aviate-rg `
  -Location eastus `
  -ApiAppName aviate-api `
  -CallAgentAppName aviate-call-agent `
  -StaticWebAppName aviate-web `
  -ContainerRegistryName aviateacr `
  -ContainerEnvironmentName aviate-env `
  -ContainerAppName aviate-engine
```

What it creates:

- Resource group
- Linux App Service plans for API and Call Agent
- App Services for API and Call Agent
- Azure Container Registry
- Log Analytics workspace
- Azure Container Apps environment

What it does not create automatically:

- Static Web App GitHub connection
- Production environment variables and secrets
- Container App deployment image
- GitHub Actions secrets and variables

Use the script first, then continue with the service-specific sections above.

If you only want a dry run of the resource names and commands, use:

```powershell
.\scripts\azure\provision-student.ps1 -WhatIf
```

## App Settings Script

After your Azure resources exist, apply environment settings from a local env file with:

```powershell
.\scripts\azure\set-app-settings.ps1 -EnvFilePath .env.production
```

Expected workflow:

1. Copy `.env.example` to `.env.production`.
2. Replace local defaults with production values.
3. Run the script to push settings into the Azure API App Service, Call Agent App Service, and Container App.

Example:

```powershell
.\scripts\azure\set-app-settings.ps1 `
  -EnvFilePath .env.production `
  -ResourceGroupName aviate-rg `
  -ApiAppName aviate-api `
  -CallAgentAppName aviate-call-agent `
  -ContainerAppName aviate-engine
```

The script reads only the keys needed by each deployed service. It does not modify your Static Web App settings; set `VITE_API_URL` there in the Azure Portal or the Static Web App configuration.

## Engine Key Bootstrap Script

The decision engine stores API keys in its own database. To generate the first production key and save it into your local deployment env file, run:

```powershell
.\scripts\azure\bootstrap-engine-key.ps1 -EnvFilePath .env.production
```

What it does:

- Loads `AIVIATE_*` settings from your local env file
- Runs `python -m aiviate.bootstrap` in `Website/aiviate-engine`
- Extracts the generated admin key
- Writes that value back into `AIVIATE_ENGINE_API_KEY=` in your env file

After that, rerun:

```powershell
.\scripts\azure\set-app-settings.ps1 -EnvFilePath .env.production
```

That pushes the generated engine key into the Flask API App Service so `Website/backend/engine_client.py` can authenticate against the deployed engine.