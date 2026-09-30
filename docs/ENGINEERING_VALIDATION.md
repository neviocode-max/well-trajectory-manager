# Engineering validation

WTM 1.0 was migrated against a frozen WTM 4.3 Stable engineering baseline. The migration preserves the original calculation behavior and uses fictional synthetic wells for regression testing.

## Frozen baseline

- Reference: `Well_Trajectory_Manager_WTM_v4.3.html`
- SHA-256: `b2384ca627e94ba10d60be5a3fbc7d1b9f3cb4e1dda5e4bdfa25aa3952da6790`
- The reference HTML is intentionally not included because it contains an embedded operational database.

## Automated regression coverage

The repository contains Vitest coverage for:

- minimum curvature and exact partial interpolation
- MD / TVD / elevation conversion
- inclination / azimuth handling
- DLS
- multiple TVD/elevation solutions
- coordinate conversion
- database normalization, duplicate handling and QC
- trajectory converter and splitter behavior
- point-to-well distance
- well-to-well closest approach
- same-elevation 2D distance
- 3D distance and radius intervals
- offset-corridor search
- Studio measurement helpers
- production invariants and database lifecycle

The source package contains **37 regression/parity tests**.

## Selected golden values

All values below use fictional `DEMO-*` fixtures.

```text
Minimum-curvature dTVD          94.62867168383083 m
Minimum-curvature dNorthing     67.48694709805608 m
Minimum-curvature dEasting      17.934193866165245 m
DLS                              6.462656138707566 deg/30 m
Point → well 3D distance        36.07373978320975 m
Well ↔ well closest distance    10.158905133826751 m
Same-elevation 2D distance      20.303884894460907 m
UTM Easting                     699163.3905617252 m
UTM Northing                    9314348.961580029 m
```

For normal floating-point precision, migrated results are expected to remain numerically equivalent to the frozen reference.

## Release gate

Before release or deployment:

```bash
npm install
npm run check
```

`npm run check` performs TypeScript checking, the Vitest regression suite and a Vite production build.
