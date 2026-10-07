import { D2R, clamp, fromMeters, lerp, toMeters } from './constants';
import { AmbiguousDepthError, AppError, RangeErrorWTC } from './errors';
import { coursePoint, doglegAngle } from './minimumCurvature';
import type { SurveyStation } from '../types/survey';
import type { WellRecord } from '../types/well';

export type TrajectoryInputType = 'mMD' | 'ftMD' | 'mTVD' | 'ftTVD' | 'mASL' | 'ftASL';

type TrajectoryKey = 'MD' | 'TVD' | 'Z';

export interface TrajectoryInputDefinition {
  key: TrajectoryKey;
  unit: 'm' | 'ft';
  label: string;
}

export const TYPES: Record<TrajectoryInputType, TrajectoryInputDefinition> = {
  mMD: { key: 'MD', unit: 'm', label: 'mMD' },
  ftMD: { key: 'MD', unit: 'ft', label: 'ftMD' },
  mTVD: { key: 'TVD', unit: 'm', label: 'mTVD' },
  ftTVD: { key: 'TVD', unit: 'ft', label: 'ftTVD' },
  mASL: { key: 'Z', unit: 'm', label: 'mASL' },
  ftASL: { key: 'Z', unit: 'ft', label: 'ftASL' },
};

export interface RangeInfo {
  min: number;
  max: number;
  label: string;
}

export function rangeFor(rec: WellRecord, type: TrajectoryInputType): RangeInfo {
  const t = TYPES[type];
  let lo: number;
  let hi: number;
  if (t.key === 'MD') {
    lo = rec.mdMin;
    hi = rec.mdMax;
  } else if (t.key === 'TVD') {
    lo = rec.tvdMin;
    hi = rec.tvdMax;
  } else {
    lo = rec.zMin;
    hi = rec.zMax;
  }
  return { min: fromMeters(lo, t.unit), max: fromMeters(hi, t.unit), label: t.label };
}

export function displayedEndpointTolerance(_unit: 'm' | 'ft'): number {
  return 0.005 + 1e-9;
}

export function snapDisplayedEndpoint(value: number, lo: number, hi: number, unit: 'm' | 'ft'): number {
  const tol = displayedEndpointTolerance(unit);
  if (Math.abs(value - lo) <= tol) return lo;
  if (Math.abs(value - hi) <= tol) return hi;
  return value;
}

/** First index whose MD >= md. */
export function lowerBound(rows: SurveyStation[], md: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].MD < md) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function stationAtMD(rec: WellRecord, md: number): SurveyStation {
  const rows = rec.rows;
  if (md < rec.mdMin - 1e-9 || md > rec.mdMax + 1e-9) {
    throw new RangeErrorWTC({ well: rec.name, requested: md, unit: 'mMD', min: rec.mdMin, max: rec.mdMax });
  }
  const i = lowerBound(rows, md);
  if (i < rows.length && Math.abs(rows[i].MD - md) < 1e-9) return { ...rows[i] };
  if (i === 0) return { ...rows[0] };
  const p = rows[i - 1];
  const n = rows[Math.min(i, rows.length - 1)];
  if (n === p) return { ...p };
  return coursePoint(rec.name, p, n, md);
}

/**
 * Return every MD solution for MD/TVD/ASL inputs. This preserves WTM 4.3's
 * multiple-branch handling for trajectories that cross the same TVD/elevation more than once.
 */
export function solveMDSolutions(rec: WellRecord, type: TrajectoryInputType, value: number): number[] {
  const t = TYPES[type];
  if (!t) throw new AppError(`Unsupported input type: ${type}`);
  if (!Number.isFinite(value)) throw new AppError('Enter a valid numeric value.');

  if (t.key === 'MD') {
    const r = rangeFor(rec, type);
    const snapped = snapDisplayedEndpoint(value, Math.min(r.min, r.max), Math.max(r.min, r.max), t.unit);
    const md = toMeters(snapped, t.unit);
    if (md < rec.mdMin - 1e-9 || md > rec.mdMax + 1e-9) {
      throw new RangeErrorWTC({ well: rec.name, requested: value, unit: t.label, min: r.min, max: r.max });
    }
    return [clamp(md, rec.mdMin, rec.mdMax)];
  }

  const r = rangeFor(rec, type);
  const snapped = snapDisplayedEndpoint(value, Math.min(r.min, r.max), Math.max(r.min, r.max), t.unit);
  const target = toMeters(snapped, t.unit);
  const key = t.key;
  const rows = rec.rows;
  const globalLo = key === 'TVD' ? rec.tvdMin : rec.zMin;
  const globalHi = key === 'TVD' ? rec.tvdMax : rec.zMax;
  if (target < globalLo - 1e-8 || target > globalHi + 1e-8) {
    throw new RangeErrorWTC({ well: rec.name, requested: value, unit: t.label, min: r.min, max: r.max });
  }

  const roots: number[] = [];
  const add = (md: number): void => {
    if (Number.isFinite(md) && !roots.some(x => Math.abs(x - md) < 1e-5)) roots.push(md);
  };
  const f = (md: number): number => stationAtMD(rec, md)[key] - target;

  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (!(b.MD > a.MD)) continue;

    const beta = doglegAngle(a.Inclination, a.Azimuth, b.Inclination, b.Azimuth) * (180 / Math.PI);
    const n = Math.max(12, Math.min(96, Math.ceil(beta / 1.5)));
    const cuts = [a.MD];
    let prevMD = a.MD;
    let prevD = Math.cos(stationAtMD(rec, a.MD).Inclination * D2R);

    for (let j = 1; j <= n; j++) {
      const md = lerp(a.MD, b.MD, j / n);
      const d = Math.cos(stationAtMD(rec, md).Inclination * D2R);
      if (prevD === 0 || d === 0 || prevD * d < 0) {
        let lo = prevMD;
        let hi = md;
        let fl = prevD;
        for (let k = 0; k < 55; k++) {
          const mid = (lo + hi) / 2;
          const fm = Math.cos(stationAtMD(rec, mid).Inclination * D2R);
          if (Math.abs(fm) < 1e-13) {
            lo = mid;
            hi = mid;
            break;
          }
          if (fl * fm <= 0) hi = mid;
          else {
            lo = mid;
            fl = fm;
          }
        }
        const ex = (lo + hi) / 2;
        if (ex > a.MD + 1e-8 && ex < b.MD - 1e-8 && !cuts.some(x => Math.abs(x - ex) < 1e-6)) cuts.push(ex);
      }
      prevMD = md;
      prevD = d;
    }

    cuts.push(b.MD);
    cuts.sort((x, y) => x - y);
    for (let j = 0; j < cuts.length - 1; j++) {
      let lo = cuts[j];
      let hi = cuts[j + 1];
      let flo = f(lo);
      let fhi = f(hi);
      const eps = 1e-7;
      if (Math.abs(flo) <= eps) add(lo);
      if (Math.abs(fhi) <= eps) add(hi);
      if (flo * fhi > 0) continue;
      if (Math.abs(flo) <= eps || Math.abs(fhi) <= eps) continue;
      for (let k = 0; k < 65; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if (Math.abs(fm) < 1e-10) {
          lo = mid;
          hi = mid;
          break;
        }
        if (flo * fm <= 0) {
          hi = mid;
          fhi = fm;
        } else {
          lo = mid;
          flo = fm;
        }
      }
      add((lo + hi) / 2);
    }
  }

  roots.sort((a, b) => a - b);
  if (!roots.length) {
    throw new RangeErrorWTC({ well: rec.name, requested: value, unit: t.label, min: r.min, max: r.max });
  }
  return roots;
}

export function solveMD(rec: WellRecord, type: TrajectoryInputType, value: number): number {
  const sols = solveMDSolutions(rec, type, value);
  if (sols.length > 1) {
    throw new AmbiguousDepthError({ well: rec.name, requested: value, unit: TYPES[type].label, solutions: sols });
  }
  return sols[0];
}

export interface ConversionOutput {
  Well: string;
  mMD: number;
  ftMD: number;
  mTVD: number;
  ftTVD: number;
  mASL: number;
  ftASL: number;
  X: number;
  Y: number;
  Azimuth: number;
  Inclination: number;
  DIP: number;
}

import { FT } from './constants';

export function outputRow(p: SurveyStation): ConversionOutput {
  return {
    Well: p.Well,
    mMD: p.MD,
    ftMD: p.MD * FT,
    mTVD: p.TVD,
    ftTVD: p.TVD * FT,
    mASL: p.Z,
    ftASL: p.Z * FT,
    X: p.X,
    Y: p.Y,
    Azimuth: p.Azimuth,
    Inclination: p.Inclination,
    DIP: 90 - p.Inclination,
  };
}

export function convertRecord(rec: WellRecord, type: TrajectoryInputType, value: number): ConversionOutput {
  return outputRow(stationAtMD(rec, solveMD(rec, type, value)));
}
