# WTM 1.0 — Controlled React/TypeScript Migration

This repository is the staged migration of **WTM 4.3 Stable** from a single self-contained HTML/CSS/vanilla-JavaScript application to:

- React
- Vite
- TypeScript
- Node.js toolchain
- Windows Azure App Service compatible target
- future Microsoft Entra ID integration boundary

WTM 4.3 remains the source of truth for behavior and engineering results.

## Current status

**Phase 1 + Phase 2 + Phase 3 completed.**

- Phase 1: engineering calculation engine
- Phase 2: database / import / export / QC layer
- Phase 3: React shell, Dashboard, Data Viewer and Database Manager

The application intentionally starts with an **empty database**. No real company data is embedded or committed.

Later engineering UI modules are shown as migration placeholders rather than being reimplemented prematurely.

## Run locally

```bash
npm install
npm run dev
```

Validation / production build:

```bash
npm run test
npm run build
```

## Supported trajectory imports in Phase 3

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

## Source structure

```text
src/
├── app/            React app state / navigation
├── components/     common, database and table components
├── data/           typed in-memory database + normalization
├── engine/         Phase 1 deterministic engineering engine
├── pages/          migrated pages
├── services/       import/export, clipboard/files, preferences
├── styles/         WTM UI tokens/layout
├── tests/          parity/regression tests
├── types/          survey/database/well types
└── utils/
```

## Fictional test data

`demo/` contains fictional `DEMO-*` files for local testing only. They are not loaded automatically.

## Important data/security rule

This repository must never contain real company well names, coordinates, trajectories, reservoir information, production information, or other confidential engineering data.

See `MIGRATION_ASSESSMENT.md` and `PHASE_2_3_REPORT.md` for architecture, risk and validation detail.
