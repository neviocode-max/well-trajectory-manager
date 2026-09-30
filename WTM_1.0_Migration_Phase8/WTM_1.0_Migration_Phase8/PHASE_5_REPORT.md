# WTM 1.0 — Phase 5 Migration Report

## Scope

Phase 5 migrates the **Well Distance** workspace from frozen **WTM 4.3 Stable** into React + TypeScript while preserving the Phase 1 distance/trajectory engine as the numerical source of truth.

WTM 4.3 Stable remains frozen at SHA-256:

`b2384ca627e94ba10d60be5a3fbc7d1b9f3cb4e1dda5e4bdfa25aa3952da6790`

No real company trajectory data is embedded in this repository. All Phase 5 regression data use fictional `DEMO-*` wells.

## Migrated functionality

### 1. Radius Search

Preserved behavior:

- reference well + reference type/value (`mMD`, `ftMD`, `mTVD`, `ftTVD`, `mASL`, `ftASL`)
- configurable search radius
- 2D and 3D modes
- 2D = horizontal separation at the exact same elevation as the selected reference point
- wells that do not intersect the reference elevation are excluded in 2D
- 3D = shortest true spatial point-to-trajectory distance
- 3D in-radius offset-well MD intervals
- nearest-first result ordering
- WTM 4.3 row fields and 3-decimal result rounding
- distance/range plot with inverted ftMD axis and radius reference line
- copy and CSV export

### 2. Well-to-Well

Preserved behavior:

- independent reference and offset well selection
- 2D and 3D modes
- reference trajectory sampled every exactly **1 ftMD**, including final TD
- 2D same-elevation comparison
- blank profile rows when the offset well does not intersect the reference elevation
- 3D shortest spatial distance from every reference sample to the full offset trajectory
- horizontal and vertical components
- exact whole-trajectory closest approach retained separately from the sampled profile minimum
- sortable result table
- blank distances remain at the bottom of sorted output
- current sort order used by copy/export
- distance profile plot with profile gaps preserved

The **Show Closest Approach in Studio** handoff is now structurally carried through the React application. Because Trajectory Studio itself is Phase 6, Phase 5 queues the reference well, offset well, two closest-approach stations and exact separation and routes to the Studio migration placeholder. Phase 6 will consume the same handoff and render/focus the closest approach.

### 3. Offset Search

Preserved behavior:

- full 3D reference-trajectory corridor search
- well-level spatial pre-filter
- exact well-to-well closest approach
- continuous corridor-entry/exit interval detection on the offset trajectory
- multiple in-radius intervals for re-entry
- minimum-distance result ranking
- offset-well radius intervals in mMD / ftMD
- 1-ftMD distance profiles over each returned interval
- radius line and per-well profile plotting
- copy/export

### 4. Point Search — Radius

Preserved behavior:

- fixed X / Y / Z reference point
- database CRS reminder
- 2D same-elevation search
- 3D point-to-trajectory search
- 3D in-radius trajectory intervals
- nearest-first ranking
- radius/distance plotting
- copy/export

### 5. Point Search — Selected Wells

Preserved behavior:

- searchable multi-well selection
- `All visible` and `Clear`
- full selected trajectories sampled every 1 ftMD
- final TD inclusion through the existing reference-profile sampler
- true 3D distance, horizontal component and vertical component at every sample
- 120,000-row safety limit
- result table renders first 500 rows while copy/export contains all rows
- multi-well distance-profile plot and per-well minimum marker

## Code separation

New Phase 5 modules:

- `src/services/wellDistance.ts`
  - pure workflow/result assembly for Radius Search, Well-to-Well, Offset Search and Point Search
  - exact WTM 4.3 output fields and rounding
  - pair-row sorting behavior
- `src/pages/WellDistance.tsx`
  - React controls, tabs, result cards, copy/export and Studio handoff
- `src/components/plots/DistancePlots.tsx`
  - Canvas-based distance plots
  - inverted depth axes
  - radius reference line
  - per-well profiles
  - hover readouts
- `src/tests/wellDistance.parity.test.ts`
  - fictional workflow regression coverage
- `demo/DEMO_distance.csv`
  - fictional deviated wells for Phase 5 manual testing

The UI does not contain independent engineering geometry. It calls the standalone `src/engine/distance.ts` engine through the typed Phase 5 service layer.

## Numerical validation

The deterministic Phase 5 service layer was compiled under strict TypeScript and exercised with three fictional deviated wells.

Selected validated values:

```text
Radius 2D, DEMO-01 @ 175 mMD → DEMO-02     10.212 m
Radius 3D, DEMO-01 @ 175 mMD → DEMO-02     10.187 m

DEMO-01 ↔ DEMO-02 exact 3D closest approach 10.158905133826751 m
Reference closest MD                         175.8861473694053 m
Offset closest MD                            152.80595509137572 m

Well-to-Well reference samples               1,150 rows
2D unavailable same-elevation samples        66 rows

150 m corridor, DEMO-02 offset interval      0–309.2 mMD
150 m corridor, DEMO-02 offset interval      0–1,014.5 ftMD

Point-selected DEMO-01 + DEMO-02 profiles    2,398 rows
```

The exact closest-approach benchmark is unchanged from the Phase 1 WTM 4.3 engine benchmark.

## Validation performed in this environment

- strict TypeScript compile of engineering/data/Phase 5 service code: **PASS**
- TypeScript syntax transpilation of all `.ts` / `.tsx` source files: **PASS**
- relative source import resolution check: **PASS**
- manual fictional Phase 5 workflow harness: **PASS**
- confidentiality scan for known production/company well identifiers: **PASS**

A full `npm install` / Vite production build still cannot be claimed in this environment because the package registry is unavailable. Run on a normal networked development machine:

```bash
npm install
npm run test
npm run build
npm run dev
```

## Deliberately deferred

- Trajectory Studio rendering and interaction — Phase 6
- actual closest-approach visualization/focus in Studio — Phase 6
- complete responsive/mobile regression — Phase 7
- Azure App Service / Entra production configuration — Phase 8
