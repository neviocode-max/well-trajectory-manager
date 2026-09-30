# WTM 1.0 production release checklist

## Engineering regression

- [ ] `npm run test` passes all parity suites.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` produces `dist/`.
- [ ] DEMO-01/02/03 tests only; no real company identifiers or coordinates committed.
- [ ] Trajectory Converter benchmark matches WTM 4.3.
- [ ] Minimum-curvature / interpolation / DLS benchmarks match WTM 4.3.
- [ ] Radius, pair, offset and point-distance benchmarks match WTM 4.3.
- [ ] Studio measurement and closest-approach handoff tested.

## Browser regression

- [ ] Windows Edge/Chrome desktop.
- [ ] Android Chrome portrait + landscape.
- [ ] iPad Safari/Chrome through HTTP/HTTPS hosting (not Files Quick Look).
- [ ] CSV import.
- [ ] TSV import.
- [ ] Copy results.
- [ ] CSV download.
- [ ] Studio mouse controls.
- [ ] Studio touch pan/rotate/pinch.
- [ ] Mobile Wells and Inspector drawers.

## Azure package

- [ ] `npm run package:azure` completed.
- [ ] `/healthz` returns HTTP 200 from the production package.
- [ ] App Service Node version satisfies `package.json` engines.
- [ ] HTTPS only according to company policy.
- [ ] `WTM_AUTH_MODE=off` unless EasyAuth is configured.
- [ ] If Entra is enabled, App Service Authentication requires the intended company users/tenant.
- [ ] No storage credentials, connection strings, passwords or SAS tokens exist in frontend source.
