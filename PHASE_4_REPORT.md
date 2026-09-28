# WTM 1.0 — Phase 4 Migration Report

## Scope

Phase 4 migrates the calculator/tooling layer from the frozen **WTM 4.3 Stable** reference into React + TypeScript while continuing to use the Phase 1 deterministic engineering engine and Phase 2 typed database.

The WTM 4.3 source remains frozen at SHA-256:

`b2384ca627e94ba10d60be5a3fbc7d1b9f3cb4e1dda5e4bdfa25aa3952da6790`

No production/company trajectory data is included in this repository.

## Migrated modules

### 1. Trajectory Converter

Preserved behavior includes:

- global input type: `mMD`, `ftMD`, `mTVD`, `ftTVD`, `mASL`, `ftASL`
- output columns: Well, MD/TVD/ASL in metric and feet, X, Y, Azimuth, Inclination
- automatic conversion using the shared trajectory engine
- well autocomplete
- Excel-style one-column or Well + value paste
- minimum eight rows with add/delete row behavior
- fill-handle repeat/series continuation
- Shift-click range selection for fill
- automatic row growth while filling near the table bottom
- whole-column selection and copy
- Ctrl/Cmd+C for selected columns when focus is not in an editor
- keyboard navigation with Enter/Shift+Enter and arrow keys
- sticky headers
- active row highlighting
- copy/export with WTM filenames
- `.csv`, `.tsv`, and `.txt` import support

Important parity detail: switching the converter input type does **not** recalculate the trajectory from the rounded display value. It moves the already-calculated value into the new input column, matching WTM 4.3 and preventing numerical drift from repeated type changes.

`Show in Studio` is intentionally visible but disabled until Trajectory Studio is migrated in Phase 6.

### 2. Trajectory Splitter

Preserved behavior includes:

- split by mMD / ftMD / mTVD / ftTVD / mASL / ftASL
- WTM-style searchable well picker with favorites/recent wells
- current-well range synchronization
- configurable interval / from / to
- 50,000 generated-station safety limit
- regular TVD/ASL target values resolved back to MD through the shared trajectory engine
- displayed-endpoint tolerance behavior
- optional inclusion of original survey stations
- Survey vs Interpolated classification
- same rounded output fields as WTM 4.3
- copy/export
- explicit stop when TVD/ASL maps to multiple MD branches, including example MD solutions

### 3. Coordinate Converter

Preserved behavior includes:

- WGS84 Latitude/Longitude → WGS84 UTM
- WGS84 UTM → Latitude/Longitude
- automatic UTM-zone detection in geographic-to-UTM mode
- spreadsheet multi-row input
- two-column Lat/Lon paste
- four-column Easting/Northing/Zone/Hemisphere paste
- keyboard navigation
- whole-column copy
- Ctrl/Cmd+C selected-column copy
- copy/export result tables
- database CRS hint
- WTM 4.3 numeric display formatting
- validation of hemisphere as N/S without silently coercing an invalid pasted value

## Phase 4 shared code

New shared files:

- `src/services/trajectoryTools.ts`
  - deterministic converter-row orchestration
  - export rounding
  - trajectory split generation
  - multiple-branch split error
- `src/components/common/WellPicker.tsx`
  - reusable WTM-style searchable well selector for Phase 4 and later tools
- `src/utils/spreadsheet.ts`
  - tab/newline paste parsing
  - spreadsheet keyboard navigation
- `src/tests/calculators.parity.test.ts`
  - calculator/splitter regression coverage

## Regression checks

The Phase 4 pure TypeScript layer was compiled with strict TypeScript settings and exercised against the fictional `DEMO-*` fixtures.

Validated checks include:

1. trajectory converter benchmark at 175 mMD
2. WTM 4.3 converter validation order
3. 3-decimal converter export values
4. regular 50 mMD trajectory splitting
5. Survey vs Interpolated classification
6. inclusion of original 220 mMD survey station
7. multiple-TVD-solution stop behavior

Manual executable parity harness result:

`PHASE4_PURE_PARITY: PASS`

The original Phase 1 numerical engine benchmarks and Phase 2 database benchmark remain unchanged.

## Validation performed in this environment

- strict TypeScript compile of non-React engineering/data/tooling code: **PASS**
- TypeScript syntax transpilation of all `.ts` / `.tsx` source files: **PASS**
- relative source import resolution check: **PASS**
- fictional-data confidentiality scan for known production identifiers: **PASS**
- manual Phase 4 parity assertions: **PASS**

A full `npm install` / Vite production build could not be executed in this environment because package-registry access timed out. No claim is made that the Vite build was executed here. On a normal networked development machine, run:

```bash
npm install
npm run test
npm run build
npm run dev
```

## Deliberately not migrated in Phase 4

- Well Distance — Phase 5
- Trajectory Studio — Phase 6
- closest-approach Studio handoff — becomes active with Phase 6
- final responsive/mobile regression — Phase 7
- Azure/Entra production configuration — Phase 8
