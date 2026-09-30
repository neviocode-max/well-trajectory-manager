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

## 4. Microsoft Entra ID — prepared, not enabled by this repository

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

## 5. Later cloud-database architecture

Do **not** add storage keys or SAS tokens to the React bundle. If WTM later lists company databases from Azure Storage, use a server API + App Service Managed Identity/RBAC so credentials never enter browser source code.

That future data layer is intentionally outside WTM 1.0 Empty Database.
