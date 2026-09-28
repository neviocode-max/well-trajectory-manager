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

**Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 completed.**

- Phase 1: engineering calculation engine
- Phase 2: database / import / export / QC layer
- Phase 3: React shell, Dashboard, Data Viewer and Database Manager
- Phase 4: Trajectory Converter, Trajectory Splitter and Coordinate Converter
- Phase 5: Well Distance — Radius Search, Well-to-Well, Offset Search and Point Search
- Phase 6: Trajectory Studio — 3D, Plan, Section, Diagnostic, inspector, measurement and closest-approach handoff

The application intentionally starts with an **empty database**. No real company data is embedded or committed.

All major WTM 4.3 engineering workspaces are now migrated. Phase 7 is the full regression/responsiveness pass before production/Azure preparation.

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

## Source structure

```text
src/
├── app/            React app state / navigation
├── components/     common, database, table and Canvas plot components
├── data/           typed in-memory database + normalization
├── engine/         Phase 1 deterministic engineering engine
├── pages/          migrated pages
├── services/       import/export, trajectory tools, distance workflows, clipboard/files, preferences
├── styles/         WTM UI tokens/layout
├── tests/          parity/regression tests
├── types/          survey/database/well types
└── utils/
```

## Fictional test data

`demo/` contains fictional `DEMO-*` files for local testing only. They are not loaded automatically. `DEMO_distance.csv` contains three fictional deviated wells intended for Well Distance testing.

## Important data/security rule

This repository must never contain real company well names, coordinates, trajectories, reservoir information, production information, or other confidential engineering data.

See `MIGRATION_ASSESSMENT.md`, `PHASE_2_3_REPORT.md`, `PHASE_4_REPORT.md`, `PHASE_5_REPORT.md`, and `PHASE_6_REPORT.md` for architecture, risk and validation detail.
