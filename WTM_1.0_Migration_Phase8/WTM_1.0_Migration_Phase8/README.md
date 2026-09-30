# WTM 1.0 — React / TypeScript Production Migration

This repository is the controlled migration of **WTM 4.3 Stable** from one self-contained HTML/CSS/vanilla-JavaScript file to:

- React
- Vite
- TypeScript
- Node.js
- a Windows Azure App Service deployment target
- a clean future boundary for Microsoft Entra ID authentication

WTM 4.3 remains the source of truth for engineering behavior and numerical results. The migration intentionally preserves the original workflows and custom Canvas plotting rather than redesigning or replacing the engineering application.

## Status

**Phases 1–8 are implemented in source.**

1. Engineering engine + frozen WTM 4.3 benchmark
2. Database / import / export / QC
3. React shell + Dashboard + Data Viewer + Database Manager
4. Trajectory Converter + Splitter + Coordinate Converter
5. Well Distance — Radius, Well-to-Well, Offset and Point Search
6. Trajectory Studio — 3D, Plan, Section, Diagnostic, inspector and measurement
7. Full regression guard + responsive/mobile/integration hardening
8. Production Node host + Windows Azure App Service packaging + future Entra boundary

WTM 1.0 starts with an **empty database**. No real company well database is embedded or committed.

## Local development

```bash
npm install
npm run dev
```

Full validation / production build:

```bash
npm run check
```

Equivalent individual commands:

```bash
npm run typecheck
npm run test
npm run build
```

After a production build:

```bash
npm start
```

Then open `http://localhost:8080`.

> The migration environment used to prepare this package could not reach the npm registry, so a genuine dependency install / Vite production build could not be executed here. Pure TypeScript compilation, offline regression checks, import-resolution checks, production-host smoke tests and Azure-package smoke tests were completed. Run `npm install` followed by `npm run check` on a normal networked development machine before release.

## Azure App Service package

After `npm install` succeeds locally:

```bash
npm run package:azure
```

This performs the Vite production build and creates `azure-package/` containing the files required by the Windows App Service target:

```text
azure-package/
├── dist/
├── server.cjs
├── web.config
├── package.json
└── DEPLOYMENT.txt
```

See `azure/README.md` and `DEPLOYMENT_CHECKLIST.md` before deployment.

## Supported trajectory imports

Full trajectory files may use CSV, TSV, semicolon-delimited or TXT text and require equivalent fields for:

- Well
- MD
- X / Easting
- Y / Northing
- Z / Elevation
- TVD

Azimuth and Inclination are optional for a full trajectory and are derived using WTM 4.3 behavior when absent.

Directional-survey files may contain:

- Well (optional for a one-well file; supported for multi-well files)
- MD
- Azimuth / AZI
- Inclination / INC

WTM requests an exact survey-station tie-in with X, Y, Z and TVD, then reconstructs the trajectory using minimum curvature.

## Responsive behavior

Desktop remains the primary engineering workspace. Phase 7 adds targeted phone/tablet support without changing engineering calculations:

- responsive navigation and toolbars
- larger touch targets on coarse-pointer devices
- horizontally scrollable engineering tables
- full-screen mobile modals
- responsive Well Distance plots
- Studio mobile Wells / Inspector drawers
- one-finger / two-finger Canvas touch gestures
- 3D rotate + two-finger pan/pinch zoom
- Plan/Section pan + pinch zoom
- touch-capable plot inspection

## Source structure

```text
src/
├── app/            application state, auth boundary and navigation
├── components/     common/database/table/Canvas components
├── data/           typed in-memory database + normalization
├── engine/         deterministic WTM engineering engine
├── pages/          migrated engineering workspaces
├── services/       import/export, trajectory, distance, auth/runtime services
├── styles/         WTM layout + responsive behavior
├── tests/          parity and production regression suites
├── types/          survey/database/well/Studio types
└── utils/
```

The production host is `server.cjs`; Azure packaging is handled by `scripts/prepare-azure.mjs`.

## Regression protection

The repository currently contains **37 Vitest regression/parity tests** covering:

- minimum curvature and partial minimum curvature
- interpolation and DLS
- multiple TVD solutions
- WGS84 / UTM conversion
- import/database/QC behavior
- calculator workflows
- 2D/3D distance workflows
- exact closest approach
- Offset Search / Point Search
- Studio measurement helpers
- production empty-database/state invariants

Golden values come from fictional `DEMO-*` trajectories and frozen WTM 4.3 calculations. See `PARITY_BENCHMARKS.md`.

## Fictional test data

`demo/` contains fictional `DEMO-*` files for development/testing only. They are not loaded automatically.

## Security / data rule

Never commit real company well names, coordinates, trajectories, reservoir information, production information, credentials, storage keys or other confidential engineering data.

The current application processes imported trajectory files in browser memory and has no cloud database integration. Microsoft Entra preparation is an authentication boundary only; no custom password system is implemented.

See:

- `MIGRATION_ASSESSMENT.md`
- `PHASE_2_3_REPORT.md`
- `PHASE_4_REPORT.md`
- `PHASE_5_REPORT.md`
- `PHASE_6_REPORT.md`
- `PHASE_7_REPORT.md`
- `PHASE_8_REPORT.md`
- `SECURITY.md`
- `DEPLOYMENT_CHECKLIST.md`
