import { mcmDelta } from '../engine/minimumCurvature';
import type { SurveyStation } from '../types/survey';
import type { WellRecord } from '../types/well';

export interface DirectionStation {
  md: number;
  inc: number;
  azi: number;
}

export function buildConsistentWell(
  name: string,
  x0: number,
  y0: number,
  z0: number,
  stations: DirectionStation[],
): SurveyStation[] {
  const rows: SurveyStation[] = [{
    Well: name,
    MD: stations[0].md,
    X: x0,
    Y: y0,
    Z: z0,
    TVD: 0,
    Inclination: stations[0].inc,
    Azimuth: stations[0].azi,
  }];
  let current = rows[0];
  for (let i = 1; i < stations.length; i++) {
    const prev = stations[i - 1];
    const next = stations[i];
    const d = mcmDelta(prev.md, prev.inc, prev.azi, next.md, next.inc, next.azi);
    current = {
      Well: name,
      MD: next.md,
      X: current.X + d.dE,
      Y: current.Y + d.dN,
      Z: current.Z - d.dTVD,
      TVD: current.TVD + d.dTVD,
      Inclination: next.inc,
      Azimuth: next.azi,
    };
    rows.push(current);
  }
  return rows;
}

export function makeRecord(name: string, rows: SurveyStation[]): WellRecord {
  const x = rows.map(r => r.X);
  const y = rows.map(r => r.Y);
  const z = rows.map(r => r.Z);
  const tvd = rows.map(r => r.TVD);
  return {
    name,
    rows,
    count: rows.length,
    mdMin: rows[0].MD,
    mdMax: rows[rows.length - 1].MD,
    tvdMin: Math.min(...tvd),
    tvdMax: Math.max(...tvd),
    zMin: Math.min(...z),
    zMax: Math.max(...z),
    xMin: Math.min(...x),
    xMax: Math.max(...x),
    yMin: Math.min(...y),
    yMax: Math.max(...y),
    mdSet: new Set(rows.map(r => r.MD)),
    cache: null,
  };
}

export const demoA = makeRecord('DEMO-01', buildConsistentWell(
  'DEMO-01', 500000, 9200000, 1500,
  [
    { md: 0, inc: 0, azi: 0 },
    { md: 100, inc: 20, azi: 45 },
    { md: 220, inc: 40, azi: 80 },
    { md: 350, inc: 55, azi: 110 },
  ],
));

export const demoB = makeRecord('DEMO-02', buildConsistentWell(
  'DEMO-02', 500080, 9200040, 1480,
  [
    { md: 0, inc: 0, azi: 0 },
    { md: 120, inc: 25, azi: 240 },
    { md: 250, inc: 45, azi: 220 },
    { md: 380, inc: 60, azi: 200 },
  ],
));

export const demoAmbiguous = makeRecord('DEMO-03', buildConsistentWell(
  'DEMO-03', 0, 0, 1000,
  [
    { md: 0, inc: 0, azi: 0 },
    { md: 200, inc: 120, azi: 0 },
    { md: 400, inc: 120, azi: 0 },
  ],
));
