# Well Trajectory Manager (WTM) 1.0

WTM is an engineering web application for well-trajectory calculation, database handling, distance analysis and trajectory visualization.

The application is built with **React, Vite and TypeScript** and is designed for local development, private Git hosting and deployment to **Windows Azure App Service**. WTM 1.0 starts with an empty database; trajectory data is imported by the user and processed in the browser.

## Capabilities

- Dashboard and survey Data Viewer
- Database import, append, QC, edit and export
- Full trajectory and MD/Azimuth/Inclination directional-survey import
- Trajectory Converter
- Trajectory Splitter
- WGS84 geographic / UTM Coordinate Converter
- Well Distance:
  - Radius Search
  - Well-to-Well
  - Offset Search
  - Point Search
- Trajectory Studio:
  - 3D View
  - Plan View
  - Section View
  - Directional diagnostics
- CSV / TSV / TXT import
- CSV export and clipboard workflows
- Desktop, tablet and mobile layouts
- Light and dark themes

## Engineering integrity

The engineering calculation layer is separated from the React UI and protected by regression/parity tests. The frozen WTM 4.3 Stable reference remains the numerical benchmark for the migrated engine.

See [`docs/ENGINEERING_VALIDATION.md`](docs/ENGINEERING_VALIDATION.md).

## Technology

- React 19
- TypeScript
- Vite
- Vitest
- Node.js production host
- Dependency-free custom Canvas plotting / 3D rendering

No external plotting or engineering-calculation library is required.

## Development

Requirements:

- Node.js matching the `engines` field in `package.json`
- npm

Install and run:

```bash
npm install
npm run dev
```

Validation:

```bash
npm run check
```

Production build:

```bash
npm run build
npm run start
```

The production host serves `dist/` and exposes `/healthz` for health checks.

## Project structure

```text
src/
├── app/          application context and navigation
├── components/   reusable UI, tables and plotting components
├── data/         database normalization and indexing
├── engine/       deterministic engineering calculations
├── pages/        WTM workspaces
├── services/     import/export and workflow services
├── styles/       application styling
├── tests/        parity and regression tests
├── types/        TypeScript domain models
└── utils/        shared utilities
```

## Default survey template

Database load/append, Data Viewer copy/export, and master/per-well database exports use this order:

```text
WELL_NAME,DEPTH_ft,DEPTH_m,DEV_ANGLE,AZIMUTH,DIP,SURV_Type,BHT,UTM_E,UTM_N,DEPTH_VERT,ELEV_FT
```

- `DEPTH_m` is measured depth in metres, preferred when both MD columns contain values. `DEPTH_ft` is used when `DEPTH_m` is blank.
- `UTM_E` and `UTM_N` are metres. `DEPTH_VERT` is TVD in feet; `ELEV_FT` is elevation in feet. Internally, WTM retains metres for calculations.
- `DEV_ANGLE` is inclination from vertical; `DIP = 90 − DEV_ANGLE` (90° vertical, 0° horizontal). DIP can supply missing inclination. Values provided together must agree within 0.01° for rounding.
- `SURV_Type` and `BHT` are optional station metadata. Blank values stay blank; supplied text is retained without assuming a BHT unit.
- Existing `Well/MD/X/Y/Z/TVD/Azimuth/Inclination` and directional `MD/AZI/INC` files remain supported.
- Trajectory Converter accepts this template and displays, copies, and exports DIP alongside its existing calculated columns.

Download a blank CSV from Database Manager, or use `sample-data/WTM_Database_Template.csv`.

## Sample data

`sample-data/` contains fictional `DEMO-*` files for development and validation only. Do not commit company well data to this repository.

## Azure App Service

Create the deployment package with:

```bash
npm run package:azure
```

See [`docs/AZURE_DEPLOYMENT.md`](docs/AZURE_DEPLOYMENT.md) and [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

WTM is prepared for future Microsoft Entra ID authentication through Azure App Service Authentication. A custom username/password system is intentionally not included.

## Security

Imported trajectory data is processed in browser memory by the current WTM 1.0 application. Do not place secrets, storage keys, production databases or confidential trajectory data in the frontend repository.

See [`docs/SECURITY.md`](docs/SECURITY.md).
