# WTM 1.0 — Phase 6 Migration Report

## Scope

Phase 6 migrates **Trajectory Studio** from frozen **WTM 4.3 Stable** into React + TypeScript while preserving the original custom Canvas rendering approach and the already-validated TypeScript trajectory/database engines.

WTM 4.3 Stable remains frozen at SHA-256:

`b2384ca627e94ba10d60be5a3fbc7d1b9f3cb4e1dda5e4bdfa25aa3952da6790`

No real company trajectory data is embedded in this repository. Phase 6 regression coverage uses only fictional `DEMO-*` wells.

## Migration approach

WTM 4.3 does **not** use Three.js, Plotly or another plotting library for Studio. It uses dependency-free browser Canvas code. Phase 6 preserves that architecture rather than replacing the renderer during the migration.

The migration separates:

- React controls/state in `src/pages/TrajectoryStudio.tsx`
- reusable Studio calculations/helpers in `src/services/studio.ts`
- 2D Canvas chart engine in `src/components/plots/studioCanvas.ts`
- 3D Canvas scene engine in `src/components/plots/studioScene3D.ts`
- handoff/focus contracts in `src/types/studio.ts`

Engineering geometry remains outside React UI code.

## Migrated functionality

### 1. 3D View

Preserved behavior:

- custom perspective 3D Canvas renderer
- selected-well rendering using origin-relative X/Y buffers and absolute elevation Z
- orbit rotation
- shift/right/middle-button pan
- mouse-wheel zoom
- double-click reset
- Top / Front / Side / Iso presets
- Z exaggeration from 1× to 8×
- grid and X/Y/Z axes
- surface marker only; no TD/bottom-hole marker was added
- optional survey stations
- optional well labels
- optional 3D station labels
- primary-well priority in label collision handling
- deterministic WTM 4.3 well-colour hashing
- hover and station picking
- PNG export

### 2. Plan View

Preserved behavior:

- X (Easting) vs Y (Northing)
- equal spatial scaling
- pan / zoom / reset
- survey station picking
- label collision handling with primary-well priority
- survey-station, label and grid toggles
- inspector/measurement marks
- CSV and PNG export

### 3. Section View

Preserved behavior:

- direct `X vs Z` and `Y vs Z` controls
- Z = elevation / mASL
- Equal Scale enabled by default
- pan / zoom / reset
- station inspection and measurement
- CSV and PNG export

No arbitrary section-azimuth feature was introduced during the migration.

### 4. Diagnostic View

Preserved behavior:

- Inclination vs MD
- Azimuth vs MD
- Dogleg Severity vs MD
- MD increases downward from zero
- azimuth plotting breaks across the 0°/360° discontinuity rather than drawing false wrap lines
- DLS unit selector for `°/30m` and `°/100ft`
- configurable DLS limit, internally retained in `°/30m`
- dashed DLS-limit reference line
- DLS max/average summary
- measurement mode disabled in Diagnostic, matching WTM 4.3

### 5. Well selection / display state

Preserved behavior:

- searchable well list
- favorites and recent-well behavior
- normal click = exclusive selection
- Ctrl / Cmd / Shift click = additive selection
- newly added well becomes primary
- removing the primary selects the first remaining well
- additive selection preserves the active view/camera
- exclusive selection re-frames the active view
- `All` selects up to the first 500 currently filtered wells
- `None` clears selection
- legend with the original WTM colour palette

### 6. Trajectory Inspector

Preserved fields/actions:

- Well
- survey-station number
- MD in metres and feet
- TVD
- elevation / mASL
- X / Y
- azimuth
- inclination
- DLS in selected unit
- distance from previous station
- distance to next station
- Copy Coordinates
- Copy MD
- Calculator handoff back to Trajectory Converter

### 7. Measurement Tool

Preserved engineering calculation:

- station-to-station 3D distance
- horizontal separation
- vertical separation
- bearing measured clockwise from North using `atan2(ΔX, ΔY)`
- absolute ΔMD
- copy measurement result

The measurement math is isolated in `src/services/studio.ts` and covered by fictional parity tests.

### 8. Cross-module handoffs

The Phase 6 app now completes the WTM 4.3 navigation loop:

- **Database Manager → Plot** opens the selected well in Studio
- **Trajectory Converter → Show in Studio** opens the well and selects the nearest survey station to the requested MD
- **Studio → Calculator** returns the inspected well/MD to Trajectory Converter
- **Well Distance → Show Closest Approach in Studio** selects the reference/offset wells, switches to 3D, draws the closest-approach line/endpoints/distance label and focuses the camera around the approach

The closest-approach camera formula is retained from WTM 4.3.

### 9. Export

Preserved:

- current-view CSV export
- 3D export using trajectory survey rows
- Plan/Section/Diagnostic export using plotted values
- PNG export from Canvas
- existing WTM filename conventions

## Numerical / helper parity

A Phase 6 fictional regression suite was added at:

`src/tests/studio.parity.test.ts`

It verifies:

- original deterministic well-colour hash/palette
- DLS factor `30.48 / 30 = 1.016` for `°/100ft`
- DLS unit labels
- reconstruction of absolute X/Y from database-origin-relative render buffers
- DLS diagnostic series scaling
- measurement 3D/horizontal/vertical distances
- bearing convention
- ΔMD
- 0–360° angle normalization

Selected fictional measurement benchmark:

```text
ΔX                 +30 m
ΔY                 +40 m
ΔZ                 -12 m
Horizontal          50.000000000000 m
3D distance         51.419840528730 m
Vertical            12.000000000000 m
Bearing             36.869897645844°
ΔMD                  60.000000000000 m
DLS 100-ft factor     1.016
```

Standalone execution of these pure helpers in this environment returned:

`STUDIO_PHASE6_HELPER_PARITY: PASS`

## Validation performed in this environment

- strict TypeScript compilation of engineering/data/Studio Canvas/helper code: **PASS**
- full TS/TSX source syntax transpilation: **PASS** (51 source files)
- temporary offline-stub application type-check after final Studio wiring: **PASS**
- relative source import resolution check: **PASS**
- standalone Phase 6 helper/parity harness: **PASS**
- confidentiality scan for known production/company identifiers: **PASS**

The temporary React/Vitest declaration stubs used only for offline type-checking were removed from the deliverable.

A real `npm install` / Vite production build still cannot be executed in this environment because DNS access to `registry.npmjs.org` fails with `EAI_AGAIN`. No claim of a real production Vite build is made here. On a normal networked machine run:

```bash
npm install
npm run test
npm run build
npm run dev
```

## Deliberately deferred

Phase 6 does not intentionally expand WTM beyond the 4.3 Studio scope. The following remain for later phases:

- complete responsive/mobile regression and layout polish — Phase 7
- full end-to-end regression review across every migrated module — Phase 7
- performance/production cleanup — Phase 7
- Azure App Service packaging/configuration — Phase 8
- Microsoft Entra ID integration boundary/configuration — Phase 8

No Fly Through, arbitrary section azimuth, formation overlays, uncertainty envelopes or anti-collision separation-factor features were introduced.
