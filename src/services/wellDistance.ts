import type { WellDatabase } from '../data/database';
import { FT } from '../engine/constants';
import {
  buildOffsetDistanceProfiles,
  closestPair3D,
  closestPointToWell3D,
  corridorIntervals3D,
  dist2,
  dist3,
  formatIntervals,
  inRadiusIntervals3D,
  minBoxDistance,
  pointAtElevation,
  referenceProfileMDs,
  wellBoxGap,
  type ClosestPairResult,
  type DistanceProfilePoint,
  type Interval,
} from '../engine/distance';
import { solveMD, stationAtMD, type TrajectoryInputType } from '../engine/trajectory';
import type { SurveyStation } from '../types/survey';
import type { Point3D, WellRecord } from '../types/well';

export type DistanceMode = '2d' | '3d';
export type DistanceRow = Record<string, string | number>;

export interface RangePlotDetail {
  well: string;
  distance: number;
  closestFt: number;
  intervalsFt: Interval[];
}

export interface OffsetPlotDetail extends RangePlotDetail {
  profiles: DistanceProfilePoint[][];
}

export interface ProfilePlotDetail {
  well: string;
  points: DistanceProfilePoint[];
  min: { distance: number; ft: number; md: number } | null;
}

export interface RadiusSearchArgs {
  referenceWell: string;
  referenceType: TrajectoryInputType;
  referenceValue: number;
  radius: number;
  mode: DistanceMode;
}

export interface RadiusSearchResult {
  referenceWell: WellRecord;
  reference: SurveyStation;
  radius: number;
  mode: DistanceMode;
  rows: DistanceRow[];
  plotDetails: RangePlotDetail[];
  noElevation: number;
}

export interface PairProfileArgs {
  referenceWell: string;
  offsetWell: string;
  mode: DistanceMode;
}

export interface PairNearest {
  distance: number;
  ref: SurveyStation;
  off: SurveyStation;
}

export interface PairProfileResult {
  mode: DistanceMode;
  ref: WellRecord;
  off: WellRecord;
  rows: DistanceRow[];
  nearest: PairNearest | null;
  closest: ClosestPairResult | null;
  totalSamples: number;
  unavailable: number;
}

export interface OffsetSearchResult {
  ref: WellRecord;
  radius: number;
  rows: DistanceRow[];
  plotDetails: OffsetPlotDetail[];
}

export interface PointRadiusSearchArgs {
  point: Point3D;
  radius: number;
  mode: DistanceMode;
}

export interface PointRadiusSearchResult {
  point: Point3D;
  radius: number;
  mode: DistanceMode;
  rows: DistanceRow[];
  plotDetails: RangePlotDetail[];
}

export interface PointSelectedResult {
  point: Point3D;
  rows: DistanceRow[];
  details: ProfilePlotDetail[];
  wellNames: string[];
}

export const PAIR_COLUMNS = [
  '#',
  'Reference mMD',
  'Reference ftMD',
  'Reference mASL',
  'Distance (meter)',
  'Offset mMD',
  'Offset ftMD',
  'Offset mASL',
  'Horizontal (meter)',
  'Vertical (meter)',
] as const;

export type PairColumn = (typeof PAIR_COLUMNS)[number];

function requirePositiveRadius(radius: number): void {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Enter a positive maximum radius.');
}

function row2D(rank: number, well: string, distance: number, point: SurveyStation): DistanceRow {
  return {
    Rank: rank,
    Well: well,
    'Distance (meter)': +distance.toFixed(3),
    mMD: +point.MD.toFixed(3),
    ftMD: +(point.MD * FT).toFixed(3),
    mTVD: +point.TVD.toFixed(3),
    ftTVD: +(point.TVD * FT).toFixed(3),
    mASL: +point.Z.toFixed(3),
    ftASL: +(point.Z * FT).toFixed(3),
    X: +point.X.toFixed(3),
    Y: +point.Y.toFixed(3),
  };
}

function row3D(rank: number, well: string, distance: number, point: SurveyStation, intervals: Interval[] | undefined): DistanceRow {
  return {
    Rank: rank,
    Well: well,
    'Distance (meter)': +distance.toFixed(3),
    'Closest mMD': +point.MD.toFixed(3),
    'Closest ftMD': +(point.MD * FT).toFixed(3),
    'Closest mASL': +point.Z.toFixed(3),
    'Closest ftASL': +(point.Z * FT).toFixed(3),
    'Closest X': +point.X.toFixed(3),
    'Closest Y': +point.Y.toFixed(3),
    'Radius mMD': intervals ? formatIntervals(intervals, 1) : '',
    'Radius ftMD': intervals ? formatIntervals(intervals, FT) : '',
  };
}

function pairProfileRow(index: number, mode: DistanceMode, refPoint: SurveyStation, offPoint: SurveyStation, distance: number): DistanceRow {
  const horizontal = dist2(refPoint, offPoint);
  const vertical = Math.abs(refPoint.Z - offPoint.Z);
  return {
    '#': index,
    'Reference mMD': +refPoint.MD.toFixed(3),
    'Reference ftMD': +(refPoint.MD * FT).toFixed(3),
    'Reference mASL': +refPoint.Z.toFixed(3),
    'Distance (meter)': +distance.toFixed(3),
    'Offset mMD': +offPoint.MD.toFixed(3),
    'Offset ftMD': +(offPoint.MD * FT).toFixed(3),
    'Offset mASL': +offPoint.Z.toFixed(3),
    'Horizontal (meter)': +horizontal.toFixed(3),
    'Vertical (meter)': +(mode === '2d' ? 0 : vertical).toFixed(3),
  };
}

function pairProfileBlankRow(index: number, refPoint: SurveyStation): DistanceRow {
  return {
    '#': index,
    'Reference mMD': +refPoint.MD.toFixed(3),
    'Reference ftMD': +(refPoint.MD * FT).toFixed(3),
    'Reference mASL': +refPoint.Z.toFixed(3),
    'Distance (meter)': '',
    'Offset mMD': '',
    'Offset ftMD': '',
    'Offset mASL': '',
    'Horizontal (meter)': '',
    'Vertical (meter)': '',
  };
}

function pointProfileRow(well: string, point: SurveyStation, input: Point3D): DistanceRow {
  const horizontal = Math.hypot(point.X - input.X, point.Y - input.Y);
  const vertical = Math.abs(point.Z - input.Z);
  const distance = Math.hypot(horizontal, vertical);
  return {
    Well: well,
    mMD: +point.MD.toFixed(3),
    ftMD: +(point.MD * FT).toFixed(3),
    mASL: +point.Z.toFixed(3),
    'Distance (meter)': +distance.toFixed(3),
    'Horizontal (meter)': +horizontal.toFixed(3),
    'Vertical (meter)': +vertical.toFixed(3),
    X: +point.X.toFixed(3),
    Y: +point.Y.toFixed(3),
  };
}

export function radiusSearch(database: WellDatabase, args: RadiusSearchArgs): RadiusSearchResult {
  const rec = database.require(args.referenceWell);
  if (!Number.isFinite(args.referenceValue)) throw new Error('Enter a valid reference value.');
  requirePositiveRadius(args.radius);

  const reference = stationAtMD(rec, solveMD(rec, args.referenceType, args.referenceValue));
  const found: Array<{
    off: WellRecord;
    hit: { point: SurveyStation; distance: number };
    intervals?: Interval[];
  }> = [];
  let noElevation = 0;

  for (const name of database.names) {
    const off = database.get(name);
    if (!off || off.name === rec.name) continue;
    if (minBoxDistance(off, reference, args.mode) > args.radius + 1e-9) continue;
    if (args.mode === '2d' && (reference.Z < off.zMin - 1e-8 || reference.Z > off.zMax + 1e-8)) {
      noElevation++;
      continue;
    }
    if (args.mode === '2d') {
      const hit = pointAtElevation(off, reference.Z, reference.X, reference.Y);
      if (!hit) {
        noElevation++;
        continue;
      }
      if (hit.distance > args.radius + 1e-9) continue;
      found.push({ off, hit });
    } else {
      const hit = closestPointToWell3D(off, reference);
      if (!hit || hit.distance > args.radius + 1e-9) continue;
      found.push({ off, hit, intervals: inRadiusIntervals3D(off, reference, args.radius) });
    }
  }

  found.sort((a, b) => a.hit.distance - b.hit.distance);
  return {
    referenceWell: rec,
    reference,
    radius: args.radius,
    mode: args.mode,
    noElevation,
    plotDetails: found.map(item => ({
      well: item.off.name,
      distance: item.hit.distance,
      closestFt: item.hit.point.MD * FT,
      intervalsFt: (item.intervals || []).map(interval => ({ from: interval.from * FT, to: interval.to * FT })),
    })),
    rows: found.map((item, index) => args.mode === '2d'
      ? row2D(index + 1, item.off.name, item.hit.distance, item.hit.point)
      : row3D(index + 1, item.off.name, item.hit.distance, item.hit.point, item.intervals)),
  };
}

export function wellPairProfile(database: WellDatabase, args: PairProfileArgs): PairProfileResult {
  const ref = database.require(args.referenceWell);
  const off = database.require(args.offsetWell);
  if (ref.name === off.name) throw new Error('Reference and offset wells must be different.');
  const mds = referenceProfileMDs(ref);
  if (!mds.length) throw new Error('Unable to sample the reference trajectory.');
  if (mds.length > 50_000) throw new Error('Reference trajectory would exceed the 50,000-row profile limit.');

  const rows: DistanceRow[] = [];
  let unavailable = 0;
  let nearest: PairNearest | null = null;

  for (const md of mds) {
    const refPoint = stationAtMD(ref, md);
    let hit: { point: SurveyStation; distance: number } | null = null;
    if (args.mode === '2d') {
      if (refPoint.Z >= off.zMin - 1e-8 && refPoint.Z <= off.zMax + 1e-8) {
        hit = pointAtElevation(off, refPoint.Z, refPoint.X, refPoint.Y);
      }
    } else {
      hit = closestPointToWell3D(off, refPoint);
    }

    if (!hit?.point) {
      unavailable++;
      rows.push(pairProfileBlankRow(rows.length + 1, refPoint));
      continue;
    }

    const distance = args.mode === '2d' ? hit.distance : dist3(refPoint, hit.point);
    rows.push(pairProfileRow(rows.length + 1, args.mode, refPoint, hit.point, distance));
    if (!nearest || distance < nearest.distance) nearest = { distance, ref: refPoint, off: hit.point };
  }

  const closest = args.mode === '3d'
    ? closestPair3D(ref, off)
    : nearest
      ? { a: nearest.ref, b: nearest.off, distance: nearest.distance }
      : null;

  return {
    mode: args.mode,
    ref,
    off,
    rows,
    nearest,
    closest,
    totalSamples: mds.length,
    unavailable,
  };
}

export function sortPairRows(rows: DistanceRow[], key: PairColumn, direction: 'asc' | 'desc'): DistanceRow[] {
  const multiplier = direction === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const aBlank = av === '' || av == null || (typeof av === 'number' && !Number.isFinite(av));
    const bBlank = bv === '' || bv == null || (typeof bv === 'number' && !Number.isFinite(bv));
    if (aBlank && bBlank) return (Number(a['#']) || 0) - (Number(b['#']) || 0);
    if (aBlank) return 1;
    if (bBlank) return -1;
    let comparison = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
    if (Math.abs(comparison || 0) < 1e-12) comparison = (Number(a['#']) || 0) - (Number(b['#']) || 0);
    return comparison * multiplier;
  });
}

export function offsetSearch(database: WellDatabase, referenceWell: string, radius: number): OffsetSearchResult {
  const ref = database.require(referenceWell);
  requirePositiveRadius(radius);
  const found: Array<{ off: WellRecord; hit: ClosestPairResult; intervals: Interval[] }> = [];

  for (const name of database.names) {
    const off = database.get(name);
    if (!off || off.name === ref.name) continue;
    if (wellBoxGap(ref, off) > radius + 1e-9) continue;
    const hit = closestPair3D(ref, off);
    if (!hit || hit.distance > radius + 1e-9) continue;
    const intervals = corridorIntervals3D(ref, off, radius, hit);
    if (!intervals.length) continue;
    found.push({ off, hit, intervals });
  }

  found.sort((a, b) => a.hit.distance - b.hit.distance);
  return {
    ref,
    radius,
    plotDetails: found.map(item => ({
      well: item.off.name,
      distance: item.hit.distance,
      closestFt: item.hit.b.MD * FT,
      intervalsFt: item.intervals.map(interval => ({ from: interval.from * FT, to: interval.to * FT })),
      profiles: buildOffsetDistanceProfiles(ref, item.off, item.intervals),
    })),
    rows: found.map((item, index) => ({
      Rank: index + 1,
      Well: item.off.name,
      'Minimum Distance (meter)': +item.hit.distance.toFixed(3),
      'Radius mMD': formatIntervals(item.intervals, 1),
      'Radius ftMD': formatIntervals(item.intervals, FT),
    })),
  };
}

export function pointRadiusSearch(database: WellDatabase, args: PointRadiusSearchArgs): PointRadiusSearchResult {
  requirePositiveRadius(args.radius);
  if (![args.point.X, args.point.Y, args.point.Z].every(Number.isFinite)) throw new Error('Enter valid X, Y and Elevation / Z values.');
  const found: Array<{
    rec: WellRecord;
    hit: { point: SurveyStation; distance: number };
    intervals: Interval[];
  }> = [];

  for (const name of database.names) {
    const rec = database.get(name);
    if (!rec) continue;
    if (minBoxDistance(rec, args.point, args.mode) > args.radius + 1e-9) continue;
    if (args.mode === '2d') {
      if (args.point.Z < rec.zMin - 1e-8 || args.point.Z > rec.zMax + 1e-8) continue;
      const hit = pointAtElevation(rec, args.point.Z, args.point.X, args.point.Y);
      if (hit?.point && hit.distance <= args.radius + 1e-9) found.push({ rec, hit, intervals: [] });
    } else {
      const hit = closestPointToWell3D(rec, args.point);
      if (!hit?.point || hit.distance > args.radius + 1e-9) continue;
      found.push({ rec, hit, intervals: inRadiusIntervals3D(rec, args.point, args.radius) });
    }
  }

  found.sort((a, b) => a.hit.distance - b.hit.distance);
  return {
    point: args.point,
    radius: args.radius,
    mode: args.mode,
    rows: found.map((item, index) => args.mode === '2d'
      ? row2D(index + 1, item.rec.name, item.hit.distance, item.hit.point)
      : row3D(index + 1, item.rec.name, item.hit.distance, item.hit.point, item.intervals)),
    plotDetails: found.map(item => ({
      well: item.rec.name,
      distance: item.hit.distance,
      closestFt: item.hit.point.MD * FT,
      intervalsFt: item.intervals.map(interval => ({ from: interval.from * FT, to: interval.to * FT })),
    })),
  };
}

export function pointSelectedProfiles(database: WellDatabase, point: Point3D, names: string[]): PointSelectedResult {
  if (![point.X, point.Y, point.Z].every(Number.isFinite)) throw new Error('Enter valid X, Y and Elevation / Z values.');
  const wellNames = names.filter(name => database.get(name));
  if (!wellNames.length) throw new Error('Select at least one well.');

  let total = 0;
  for (const name of wellNames) total += referenceProfileMDs(database.require(name)).length;
  if (total > 120_000) throw new Error('Selected wells would create more than 120,000 profile rows. Select fewer wells.');

  const rows: DistanceRow[] = [];
  const details: ProfilePlotDetail[] = [];
  for (const name of wellNames) {
    const rec = database.require(name);
    const mds = referenceProfileMDs(rec);
    const points: DistanceProfilePoint[] = [];
    let min: ProfilePlotDetail['min'] = null;
    for (const md of mds) {
      const p = stationAtMD(rec, md);
      const row = pointProfileRow(rec.name, p, point);
      rows.push(row);
      const distance = Number(row['Distance (meter)']);
      const ft = Number(row.ftMD);
      points.push({ ft, distance });
      if (!min || distance < min.distance) min = { distance, ft, md: p.MD };
    }
    details.push({ well: rec.name, points, min });
  }

  return { point, rows, details, wellNames };
}
