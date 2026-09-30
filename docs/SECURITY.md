# Security notes

WTM 1.0 is an empty-database engineering client. Imported trajectory data is processed in browser memory and is not uploaded by the current application.

## Rules

- Never commit real company trajectory/reservoir/production data to this repository.
- Never place secrets in React/Vite source or `VITE_*` environment variables; Vite values are visible to users in the browser bundle.
- Do not implement a custom password store. Use Microsoft Entra ID through Azure App Service Authentication when company IT enables authentication.
- Future Azure Storage access should be performed by a protected backend using Managed Identity/RBAC, not by embedding account keys or long-lived SAS tokens in the frontend.
- Keep production dependencies and Node runtime patched according to company policy.

The included Node host sends restrictive default security headers. If company infrastructure adds stricter headers at the reverse proxy/App Service layer, test Canvas export, local file import, clipboard and EasyAuth before rollout.
