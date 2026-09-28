# WTM 4.3 Stable — Migration Assessment

## 1. Current architecture

WTM 4.3 is a single self-contained browser application (~1 MB) with one inline CSS block and two inline JavaScript blocks. The first JavaScript block contains the embedded startup CSV database. The second contains all application logic inside one IIFE. It has no external URLs or third-party JavaScript dependencies and performs calculations client-side.

Major internal layers already present in WTM 4.3:

- utilities / CSV / clipboard / export
- localStorage preferences
- trajectory engineering engine
- in-memory database/index engine
- trajectory conversion service
- reusable UI helpers
- custom 2D Canvas plot engine
- custom 3D Canvas scene renderer
- feature modules
- shell/navigation/bootstrap

This existing separation is a strong basis for a controlled migration; the main task is turning implicit modules/IIFEs into explicit typed modules and React components without changing behavior.

## 2. Feature inventory

### Workspace
- Dashboard
  - database summary
  - Data Viewer
  - well selection
  - copy/export viewer results
- Trajectory Converter
  - input types: mMD, ftMD, mTVD, ftTVD, mASL, ftASL
  - spreadsheet-style multi-row entry
  - well picker/autocomplete
  - batch paste from Excel-like data
  - drag fill / series continuation
  - per-column copy
  - keyboard navigation
  - import CSV/text
  - copy/export results
  - handoff to Studio
- Database Manager
  - load/replace database
  - append database
  - duplicate-well conflict handling: skip/replace/rename
  - export master database
  - clear database
  - well list/search
  - per-well Plot / Export / Edit Data / Delete
  - project and CRS metadata
  - QC summary and filters
  - conflicting duplicate MD reporting
  - geometry-closure QC
  - full XYZ/TVD survey import
  - MD/AZI/INC directional import with tie-in reconstruction
  - multi-well directional-survey file handling

### Tools
- Trajectory Splitter
  - regular resampling by MD/TVD/ASL
  - optional original survey stations
  - explicit ambiguity handling for multiple TVD/ASL solutions
  - copy/export
- Trajectory Studio
  - 3D View
  - Plan View
  - Section View: X vs Z / Y vs Z
  - Diagnostic View: Inclination / Azimuth / DLS
  - DLS unit switch and limit line
  - equal spatial scaling option
  - well selection/search
  - labels/stations/grid/legend controls
  - inspector
  - measurement
  - PNG/CSV export
  - calculator handoff
  - closest-approach overlay and focus
- Well Distance
  - Radius Search
  - Well-to-Well profile
  - Offset Search
  - Point Search
    - Radius Search
    - Selected Wells profiles
  - 2D same-elevation calculations
  - 3D spatial calculations
  - closest approach
  - in-radius MD intervals
  - exact 1-ft reference sampling where used
  - sorting/copy/export
  - interactive Canvas plots/tooltips
- Coordinate Converter
  - WGS84 Lat/Lon → UTM
  - UTM → WGS84 Lat/Lon
  - spreadsheet-style multi-row conversion
  - Excel-like paste
  - keyboard navigation
  - per-column copy
  - copy/export results

### Cross-cutting UX already in 4.3
- dark/light theme
- sticky table headers
- unit-aware headers
- standardized empty states
- standardized copy/export helpers
- contextual/date-stamped CSV filenames
- keyboard shortcuts
- search/filter controls
- toasts and structured error messages

## 3. Engineering calculation inventory

### Minimum-curvature / trajectory geometry
- `doglegAngle`
- `ratioFactor`
- `mcmDelta`
- `directionVector`
- `anglesFromDirection`
- `mcmPartial`
- `coursePoint`
- `courseClosureResidual`
- `courseSagitta`
- `courseDeviationBound`
- `lerpAngle`
- `dlsPer30`
- `deriveAngles`

Important 4.3 behavior: `coursePoint` uses exact partial minimum curvature and then a smooth closure correction to anchor interpolated courses to imported endpoint XYZ/TVD when imported geometry and survey angles are not perfectly consistent. This must not be removed during cleanup.

### Trajectory conversion / inverse solving
- range handling for MD/TVD/ASL in metric/imperial units
- displayed-endpoint tolerance/snap
- binary MD lookup
- interpolated station evaluation
- multi-root TVD/ASL solving
- explicit `AmbiguousDepthError`
- conversion output to m/ft MD, TVD, ASL, X/Y, azimuth, inclination

### Distance/proximity engine
- point-to-course / point-to-well 3D closest point
- same-elevation 2D intersections
- well-to-well 3D closest pair
- well-to-well same-elevation pair
- conservative segment bounding
- chord seeds
- iterative course-pair refinement
- radius crossing/root finding
- in-radius trajectory intervals
- full-trajectory corridor intervals
- offset-distance profiles sampled at 1 ftMD
- well/segment bounding-box pruning

### Coordinate conversion
- WGS84 Lat/Lon ↔ UTM
- UTM zone handling including Norway/Svalbard exceptions

### Directional survey reconstruction
- MD/AZI/INC trajectory reconstruction forward and backward from an exact tie-in station using minimum curvature

### QC-related engineering calculations
- derived inclination/azimuth from imported geometry
- course geometry closure residual
- tolerance currently `max(1 m, 2% of course MD length)`

## 4. Data/storage architecture

WTM 4.3 uses an in-memory `Map` keyed by lowercase well name. Each record contains sorted survey rows, cached range values, and lazily built typed-array render buffers. A shared local XY origin is calculated for rendering precision with large coordinate values.

Core station data model:

- `Well`
- `MD`
- `X` / Easting
- `Y` / Northing
- `Z` / elevation (mASL, positive up)
- `TVD` (positive down)
- `Azimuth` (clockwise from North)
- `Inclination`

Persistent browser storage is currently limited to small user preferences via `localStorage` (theme, favorites/recent-related settings). The imported well database itself is not persisted across reloads.

WTM 4.3 full build embeds a startup CSV in the HTML. WTM 1.0 migration target must instead start empty and must not contain real company data.

## 5. External JavaScript libraries

None detected. WTM 4.3 is vanilla JavaScript and uses browser APIs directly, including Canvas, File/Blob/download, Clipboard fallback, and localStorage. There are no external script URLs, `fetch` calls, npm libraries, React/Vue, Plotly, Three.js, D3, SheetJS, or Papa Parse in the stable file.

## 6. Major migration risks

1. **Numerical drift from “cleaning up” formulas.** Exact partial MCM, azimuth wrap, closure correction, root tolerances, and distance refinement iteration counts are behavior, not implementation detail.
2. **Changing 2D semantics.** WTM 4.3 defines 2D well distance as horizontal separation at the same elevation, not simple plan-view minimum distance independent of Z.
3. **Losing multiple TVD/ASL branches.** Reverse lookup deliberately returns/detects multiple trajectory positions.
4. **Distance-engine regressions.** Bounding, conservative pruning, chord seeding, course refinement, interval root finding, and re-entry handling are interdependent.
5. **Import/QC regressions.** Duplicate MD precedence, conflict reporting, angle derivation, azimuth normalization, inclination validation, and geometry QC need parity.
6. **Directional-import regression.** Multi-well grouping and tie-in reconstruction are separate from ordinary XYZ/TVD import and should remain so.
7. **Canvas behavior migration.** Studio and distance plots are custom Canvas renderers; replacing them with a plotting dependency during migration would increase parity risk.
8. **React state synchronization.** Existing IIFEs mutate state directly. React migration must establish state ownership without triggering calculation changes or stale derived results.
9. **Large tables/performance.** Converting every mutable table directly into naïve controlled React inputs could degrade performance.
10. **File/browser differences.** Clipboard, downloads, CSV/TSV import, and mobile file pickers need browser-specific regression checks.
11. **Confidential data leakage.** The React repository and public test deployments must use fictional data only.

## 7. Proposed React/TypeScript structure

```text
src/
├── app/
│   ├── App.tsx
│   └── routes.ts
├── components/
│   ├── common/
│   ├── tables/
│   ├── plots/
│   └── studio/
├── pages/
│   ├── Dashboard.tsx
│   ├── TrajectoryConverter.tsx
│   ├── DatabaseManager.tsx
│   ├── TrajectorySplitter.tsx
│   ├── WellDistance.tsx
│   ├── CoordinateConverter.tsx
│   └── Studio.tsx
├── engine/
│   ├── constants.ts
│   ├── minimumCurvature.ts
│   ├── trajectory.ts
│   ├── distance.ts
│   ├── coordinates.ts
│   ├── directionalSurvey.ts
│   └── errors.ts
├── data/
│   ├── database.ts
│   ├── normalization.ts
│   └── qc.ts
├── services/
│   ├── importExport.ts
│   ├── clipboard.ts
│   └── preferences.ts
├── types/
│   ├── survey.ts
│   ├── well.ts
│   └── database.ts
├── utils/
└── tests/
```

The key change from the initial suggested structure is to keep the **database/index/QC layer separate from the pure engineering engine**. This mirrors the useful separation already present in WTM 4.3 and makes regression testing easier.

## 8. Migration plan

1. Freeze WTM 4.3 Stable as benchmark.
2. Extract/type pure engineering engine with no DOM dependencies.
3. Build fictional golden-well regression fixtures and compare with WTM 4.3 outputs.
4. Migrate database normalization/index/QC logic.
5. Migrate CSV/TSV import/export, clipboard, preferences, and empty-database startup.
6. Migrate Dashboard + Data Viewer.
7. Migrate Trajectory Converter and spreadsheet helpers.
8. Migrate Coordinate Converter and Trajectory Splitter.
9. Migrate Well Distance UI around the already-tested distance engine.
10. Migrate Studio Canvas engines and controls without substituting new plotting libraries.
11. Migrate remaining shell/navigation/theme/status behavior.
12. Mobile/responsive pass without changing desktop engineering workflow.
13. End-to-end regression against WTM 4.3.
14. Production build and Windows Azure App Service packaging.
15. Add Microsoft Entra ID only after core WTM 1.0 parity is accepted.

## Phase 1 acceptance criterion

The TypeScript engine must match WTM 4.3 on fictional benchmark inputs to floating-point tolerance before database/UI migration proceeds.
