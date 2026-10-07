# WTM 1.0 — Windows Azure App Service deployment

WTM is a React/Vite client application served by a very small dependency-free Node.js host (`server.cjs`). The engineering calculations remain in the browser. The production host exists to make deployment to Windows Azure App Service predictable and to provide a future authentication/runtime-config boundary.

## Production topology

```text
Browser
  ↓ HTTPS
Azure App Service (Windows)
  ↓ serves dist/
WTM React application

Future authentication:
Browser → App Service Authentication / Microsoft Entra ID → WTM
```

The production package contains **no real well database**. WTM starts empty and users import an approved local file.

## 1. Validate locally

```bash
npm install
npm run check
npm run start
```

Open `http://localhost:8080` after the build. `GET /healthz` should return HTTP 200.

> After the first successful `npm install`, commit the generated `package-lock.json` to the private repository and use `npm ci` in CI/CD.

## 2. Prepare a deployment folder

```bash
npm run package:azure
```

This creates `azure-package/` containing only:

- `dist/`
- `server.cjs`
- `web.config`
- a minimal production `package.json`
- `DEPLOYMENT.txt`

Zip the **contents** of `azure-package/` and deploy that ZIP to the Windows App Service. No npm packages are required at runtime because React is already bundled and the Node host uses only Node built-ins.

## 3. App Service settings

Recommended application settings:

```text
NODE_ENV=production
WTM_ENVIRONMENT=production
WTM_VERSION=1.0.0
WTM_AUTH_MODE=off
```

Choose a Node.js version compatible with the repository `engines` field. The Node host listens on the port supplied by App Service through `PORT`.

The included `web.config` routes Windows App Service requests through `server.cjs`. The Node host serves Vite's `dist/`, supplies security headers, long-cache headers for hashed assets, a SPA fallback, `/healthz`, and `/api/runtime-config`.

## 4. GitHub Actions → Azure App Service

The repository includes `.github/workflows/azure-app-service.yml`.

It is intentionally dormant until Azure is ready. The deployment job runs only when this repository variable is set:

```text
AZURE_DEPLOY_ENABLED=true
```

Required repository variable:

```text
AZURE_WEBAPP_NAME=<your App Service name>
```

Required GitHub Actions secrets for OpenID Connect (OIDC):

```text
AZURE_CLIENT_ID=<Azure application or managed identity client ID>
AZURE_TENANT_ID=<Microsoft Entra tenant ID>
AZURE_SUBSCRIPTION_ID=<Azure subscription ID>
```

Ask the Azure/IT administrator to create the federated identity credential for this GitHub repository/environment and grant the identity permission to deploy to the target App Service. No Azure client secret or App Service publish profile is stored in GitHub.

After `AZURE_DEPLOY_ENABLED=true` is configured, the workflow will:

1. Wait for **CI and GitHub Pages** to finish successfully on `main`.
2. Check out the exact validated commit.
3. Run TypeScript checks and Vitest regression tests again.
4. Run `npm run package:azure`.
5. Sign in to Azure with `azure/login@v2` using OIDC.
6. Deploy `azure-package/` with `azure/webapps-deploy@v3`.

It can also be started manually from **GitHub → Actions → Azure App Service → Run workflow**.

The workflow uses the GitHub environment:

```text
azure-production
```

Company administrators can optionally add deployment approvals/protection rules to that environment.

Microsoft reference: https://learn.microsoft.com/azure/app-service/deploy-github-actions

## 5. Microsoft Entra ID — prepared, not enabled by this repository

WTM does **not** contain a username/password system and does not perform its own OAuth flow.

When IT is ready:

1. In the App Service, open **Settings → Authentication**.
2. Add **Microsoft** as the identity provider.
3. Restrict access according to company policy (for an internal app, commonly require authentication and the company tenant).
4. Set App Service application setting:

```text
WTM_AUTH_MODE=appservice
```

The frontend will then read identity from the App Service built-in `/.auth/me` endpoint. WTM intentionally keeps only non-token identity information (name/id/claims) and does not store provider access or refresh tokens.

Microsoft documentation:

- App Service Node.js quickstart: https://learn.microsoft.com/azure/app-service/quickstart-nodejs
- App Service authentication with Microsoft Entra ID: https://learn.microsoft.com/entra/identity-platform/multi-service-web-app-authentication-app-service
- App Service OAuth token / `/.auth/me` endpoint: https://learn.microsoft.com/azure/app-service/configure-authentication-oauth-tokens

## 6. Later cloud-database architecture

Database Manager includes a **Saved Databases** UI design with a selector, save status, **Save Changes**, and a **Save As** naming preview. These are not connected to storage yet:

- The selector shows the current working upload but cannot load cloud datasets.
- **Save Changes** and **Save to Cloud** are disabled.
- **Save As** lets users preview the dataset name, project, CRS, and record counts; it saves no data or name.
- **Apply Metadata** updates only the current browser session. CSV export remains the way to keep a copy before cloud saving is available.

When storage is added, load the authorized dataset list into the selector and give each dataset a stable ID independent of its project name. Persist surveys and metadata together; track unsaved edits and handle them before switching datasets. Enable the save buttons only after server authentication, authorization, and storage are available.

The cloud storage provider is not selected yet. Hosting WTM on Azure App Service does not require its databases to be stored in Azure; connect the server API to the chosen cloud service independently of hosting.

Do **not** add storage credentials to the React bundle. Use a server API with the chosen provider's authentication and access controls. If Azure Storage is selected, App Service Managed Identity/RBAC is an option so credentials never enter browser source code.

That future data layer is intentionally outside WTM 1.0 Empty Database.
