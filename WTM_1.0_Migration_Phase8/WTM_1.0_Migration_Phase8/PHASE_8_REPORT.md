# WTM 1.0 — Phase 8 Production / Azure Readiness Report

## Scope

Phase 8 prepares the migrated WTM 1.0 source for a production build and a **Windows Azure App Service** deployment while keeping authentication separate from engineering logic.

It does **not** add a cloud trajectory database and does **not** implement a custom username/password system.

## Production Node host

Added:

`server.cjs`

The host intentionally uses only Node built-ins and serves the Vite `dist/` directory. Responsibilities:

- listen on Azure/local `PORT`
- serve Vite assets and `index.html`
- SPA-safe fallback
- `/healthz`
- `/api/runtime-config`
- cache hashed `/assets/` files
- avoid caching HTML/runtime configuration
- basic restrictive security headers
- GET/HEAD only

The engineering calculations continue to execute in the browser.

## Windows App Service configuration

Added:

`web.config`

It routes Windows/IISNode traffic to `server.cjs`. No React/engineering code is coupled to IIS or Azure.

## Deployment packaging

Added:

`scripts/prepare-azure.mjs`

Command:

```bash
npm run package:azure
```

The command first performs the normal TypeScript + Vite build, then creates:

```text
azure-package/
├── dist/
├── server.cjs
├── web.config
├── package.json
└── DEPLOYMENT.txt
```

The generated runtime `package.json` has no npm dependencies because React is already bundled into `dist/` and the small production host uses Node built-ins only.

## Runtime configuration boundary

Added:

- `src/services/runtimeConfig.ts`
- `/api/runtime-config` in `server.cjs`

Production settings can expose non-secret runtime state to the React application without putting secrets in the Vite bundle:

```text
WTM_ENVIRONMENT=production
WTM_VERSION=1.0.0
WTM_AUTH_MODE=off | appservice
```

## Microsoft Entra ID preparation

Added:

- `src/services/auth.ts`
- `src/app/AuthContext.tsx`

The application deliberately does **not** perform its own OAuth/password workflow. When App Service Authentication is enabled by company IT and `WTM_AUTH_MODE=appservice`, the frontend may read the authenticated App Service identity from `/.auth/me`.

WTM stores only the normalized non-token identity needed by the UI and intentionally discards access/refresh-token fields.

Actual access enforcement should be configured in **Azure App Service Authentication**. The React badge is informational; it is not a replacement for platform access control.

## Security/data preparation

Added:

- `.env.example`
- `SECURITY.md`
- `DEPLOYMENT_CHECKLIST.md`
- `azure/README.md`

Rules documented for the production repository:

- no real company trajectory database
- no passwords/storage credentials in React source
- no secrets in `VITE_*` values
- no custom password implementation
- future cloud-storage access should use a protected backend + Managed Identity/RBAC rather than browser-embedded credentials

## Build/tooling updates

`package.json` now includes:

```text
npm run dev
npm run typecheck
npm run test
npm run build
npm run check
npm start
npm run package:azure
```

The Node engine constraint is aligned with the current Vite toolchain requirement:

```text
>=20.19 <21 || >=22.12
```

`vite.config.ts` uses a relative base so the built frontend is not tied to one host name/path and disables production sourcemaps.

## Production host / packaging validation performed

The migration environment executed the following without npm packages:

```text
package.json JSON parse                    PASS
web.config XML parse                       PASS
server.cjs Node syntax                     PASS
prepare-azure.mjs Node syntax              PASS
Azure package script smoke                 PASS
Node production host smoke                 PASS
/healthz                                   PASS
/api/runtime-config                        PASS
hashed asset immutable cache header        PASS
Content-Security-Policy response header    PASS
```

The temporary fake `dist/` and smoke-test `azure-package/` were removed afterwards. **No fake production build is included.**

## Remaining release gate

The only material validation that could not be performed in this environment is a real dependency-backed Vite build/browser run because `registry.npmjs.org` was unreachable.

Before release, on a normal development machine run:

```bash
npm install
npm run check
npm run package:azure
```

Then perform the browser/device checks in `DEPLOYMENT_CHECKLIST.md` and commit the generated `package-lock.json` to the private repository. Subsequent CI/CD should use the lock file (`npm ci`).

