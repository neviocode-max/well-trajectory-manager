# WTM 1.0 — Phase 7 Regression & Responsive Hardening Report

## Scope

Phase 7 is an integration/regression pass over the already-migrated WTM engineering workspaces. It deliberately avoids changing the validated engineering formulas.

The goals are:

- protect WTM 4.3 numerical parity during final integration
- remove migration-only UI/status artifacts
- improve phone/tablet usability without compromising desktop engineering workflows
- add touch behavior to the existing custom Canvas renderers
- improve production failure/loading behavior
- reduce initial loading cost for the heaviest workspaces

## Engineering regression guard

A new production-level regression suite was added at:

`src/tests/production.regression.test.ts`

It verifies:

1. WTM starts with an empty in-memory database.
2. All six trajectory reference types resolve back to the same physical point.
3. Exact well-to-well closest approach remains independent of the 1-ft profile sampling used for the table/plot.
4. Point Search, Offset Search and Studio measurement use the same X/Y/Z convention.
5. Edit/rename/clear operations do not leave stale database state.

Together with the earlier suites, the repository now contains **37 Vitest tests**:

```text
engine.parity.test.ts          9
database.parity.test.ts        6
calculators.parity.test.ts     6
wellDistance.parity.test.ts    5
studio.parity.test.ts          6
production.regression.test.ts  5
                               --
TOTAL                         37
```

Because the npm registry was unavailable in the migration environment, Vitest itself could not be installed/executed here. To compensate before handoff, a standalone strict-TypeScript/Node regression harness exercised the same pure engineering/data/service modules and key production invariants. Result:

`PHASE7_CORE_REGRESSION: PASS`

The frozen closest-approach benchmark remains:

```text
DEMO-01 ↔ DEMO-02 exact 3D distance  10.158905133826751 m
Reference MD                          175.8861473694053 m
Offset MD                             152.80595509137572 m
```

No mathematical formulas were intentionally changed in Phase 7.

## Integration hardening

### Error boundary

Added `src/components/common/ErrorBoundary.tsx` and wrapped the application root. A React render failure now presents a controlled WTM recovery screen rather than a blank application. The boundary does not upload imported trajectory data or error payloads.

### Lazy loading

The two heaviest workspaces are loaded with React lazy/Suspense:

- Well Distance
- Trajectory Studio

This keeps the initial shell smaller while preserving all engineering logic in the same client application.

### Migration UI cleanup

Removed the Phase migration-status card from Dashboard and changed the shell status label to `WTM 1.0`.

## Responsive/mobile pass

Desktop behavior remains primary. The same React app adapts below tablet/phone breakpoints.

### General

- dynamic viewport-height (`dvh`) support
- safe-area handling for iPad/iPhone style displays
- touch-sized buttons/inputs on coarse-pointer devices
- toolbar wrapping/stacking
- full-screen phone modals
- preserved horizontal scrolling for dense engineering tables
- mobile-friendly table and converter cell sizing

### Well Distance

- Canvas hover handling moved to pointer events so touch devices can inspect plot positions.
- plots resize for tablet/phone viewports.
- result controls wrap rather than being compressed.

### Trajectory Studio

The desktop side panes remain unchanged at desktop widths. On smaller screens they become drawers:

- `Wells` opens the well-selection drawer
- `Inspector` opens the trajectory-inspector drawer
- an overlay closes the active drawer
- selecting a survey station on small screens can open the Inspector automatically

Custom Canvas touch controls were added without replacing the WTM renderer:

**3D**

- one finger: rotate
- two fingers: pan
- pinch: zoom
- tap: pick nearest survey station

**Plan / Section / Diagnostic Canvas**

- one finger: pan
- pinch: zoom around the gesture midpoint
- tap: station selection where applicable

Mouse behavior remains available for desktop.

## Validation performed in the migration environment

```text
Pure engineering/data TypeScript compile   PASS
All TS/TSX syntax transpilation             PASS
Temporary full-source TS semantic check     PASS
Relative import resolution                  PASS (57 source files)
CSS brace/structure sanity                   PASS
Standalone engineering regression           PASS
Confidential identifier scan                PASS
```

The temporary React/Vitest declarations used for the offline semantic check are **not** included in the repository; they only replace missing `node_modules` type packages for this environment. A normal `npm install && npm run typecheck` remains the authoritative React type check before release.

## Data safety

A case-insensitive repository scan found no known production/company well identifiers from the WTM 4.3 development database. Development fixtures remain limited to:

- DEMO-01
- DEMO-02
- DEMO-03

