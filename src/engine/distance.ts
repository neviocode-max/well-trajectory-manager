import { FT, lerp } from './constants';
import { courseDeviationBound, coursePoint } from './minimumCurvature';
import { RangeErrorWTC } from './errors';
import { solveMDSolutions, stationAtMD } from './trajectory';
import type { SurveyStation } from '../types/survey';
import type { Point3D, WellRecord } from '../types/well';

interface SegmentProxy {
  rec: WellRecord;
  a: SurveyStation;
  b: SurveyStation;
  i: number;
  bound: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface SegmentIndex {
  segments: SegmentProxy[];
  byX: SegmentProxy[];
}

export interface ClosestPointResult {
  point: SurveyStation;
  distance: number;
}

export interface ClosestPairResult {
  a: SurveyStation;
  b: SurveyStation;
  distance: number;
}

export interface Interval {
  from: number;
  to: number;
}

const distanceSegmentCache = new WeakMap<WellRecord, SegmentIndex>();

export function segmentStation(rec: WellRecord, a: SurveyStation, b: SurveyStation, md: number): SurveyStation {
  return coursePoint(rec.name, a, b, md);
}

export function dist3(a: Point3D, b: Point3D): number {
  return Math.hypot(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
}

export function dist2(a: Point3D, b: Point3D): number {
  return Math.hypot(a.X - b.X, a.Y - b.Y);
}

export function makeSegmentProxy(rec: WellRecord, a: SurveyStation, b: SurveyStation, i: number): SegmentProxy {
  const pad = courseDeviationBound(a, b);
  return {
    rec,
    a,
    b,
    i,
    bound: pad,
    minX: Math.min(a.X, b.X) - pad,
    maxX: Math.max(a.X, b.X) + pad,
    minY: Math.min(a.Y, b.Y) - pad,
    maxY: Math.max(a.Y, b.Y) + pad,
    minZ: Math.min(a.Z, b.Z) - pad,
    maxZ: Math.max(a.Z, b.Z) + pad,
  };
}

export function segmentIndex(rec: WellRecord): SegmentIndex {
  let idx = distanceSegmentCache.get(rec);
  if (idx) return idx;
  const segments: SegmentProxy[] = [];
  for (let i = 0; i < rec.rows.length - 1; i++) {
    segments.push(makeSegmentProxy(rec, rec.rows[i], rec.rows[i + 1], i));
  }
  idx = { segments, byX: segments.slice().sort((a, b) => a.minX - b.minX) };
  distanceSegmentCache.set(rec, idx);
  return idx;
}

export function pointBoxGap(p: Point3D, s: SegmentProxy): number {
  const dx = p.X < s.minX ? s.minX - p.X : p.X > s.maxX ? p.X - s.maxX : 0;
  const dy = p.Y < s.minY ? s.minY - p.Y : p.Y > s.maxY ? p.Y - s.maxY : 0;
  const dz = p.Z < s.minZ ? s.minZ - p.Z : p.Z > s.maxZ ? p.Z - s.maxZ : 0;
  return Math.hypot(dx, dy, dz);
}

export function segmentBoxGap(a: SegmentProxy, b: SegmentProxy): number {
  const dx = a.maxX < b.minX ? b.minX - a.maxX : b.maxX < a.minX ? a.minX - b.maxX : 0;
  const dy = a.maxY < b.minY ? b.minY - a.maxY : b.maxY < a.minY ? a.minY - b.maxY : 0;
  const dz = a.maxZ < b.minZ ? b.minZ - a.maxZ : b.maxZ < a.minZ ? a.minZ - b.maxZ : 0;
  return Math.hypot(dx, dy, dz);
}

export function pointsAtElevation(rec: WellRecord, z: number): SurveyStation[] {
  try {
    return solveMDSolutions(rec, 'mASL', z).map(md => stationAtMD(rec, md));
  } catch (err) {
    if (err instanceof RangeErrorWTC) return [];
    throw err;
  }
}

export function pointAtElevation(rec: WellRecord, z: number, refX: number, refY: number): { point: SurveyStation; distance: number } | null {
  const pts = pointsAtElevation(rec, z);
  let best: { point: SurveyStation; distance: number } | null = null;
  for (const p of pts) {
    const d = Math.hypot(p.X - refX, p.Y - refY);
    if (!best || d < best.distance) best = { point: p, distance: d };
  }
  return best;
}

export function closestOnSegment3D(rec: WellRecord, a: SurveyStation, b: SurveyStation, ref: Point3D): { point: SurveyStation; distance: number; md: number } {
  if (Math.abs(b.MD - a.MD) < 1e-10) {
    const p = { ...a };
    return { point: p, distance: dist3(p, ref), md: p.MD };
  }

  const N = 8;
  const samples: Array<{ md: number; p: SurveyStation; d: number }> = [];
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i <= N; i++) {
    const md = lerp(a.MD, b.MD, i / N);
    const p = segmentStation(rec, a, b, md);
    const d = dist3(p, ref);
    samples.push({ md, p, d });
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }

  let lo = samples[Math.max(0, bestI - 1)].md;
  let hi = samples[Math.min(N, bestI + 1)].md;
  for (let k = 0; k < 24; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const p1 = segmentStation(rec, a, b, m1);
    const p2 = segmentStation(rec, a, b, m2);
    if (dist3(p1, ref) <= dist3(p2, ref)) hi = m2;
    else lo = m1;
  }
  const md = (lo + hi) / 2;
  const p = segmentStation(rec, a, b, md);
  const d = dist3(p, ref);
  if (bestD < d) return { point: samples[bestI].p, distance: bestD, md: samples[bestI].md };
  return { point: p, distance: d, md };
}

export function pointToChordDistance(p: Point3D, a: Point3D, b: Point3D): number {
  const ux = b.X - a.X;
  const uy = b.Y - a.Y;
  const uz = b.Z - a.Z;
  const vv = ux * ux + uy * uy + uz * uz;
  if (vv < 1e-12) return dist3(p, a);
  const t = Math.max(0, Math.min(1, ((p.X - a.X) * ux + (p.Y - a.Y) * uy + (p.Z - a.Z) * uz) / vv));
  const q = { X: a.X + t * ux, Y: a.Y + t * uy, Z: a.Z + t * uz };
  return dist3(p, q);
}

export function closestPointToWell3D(rec: WellRecord, ref: Point3D): ClosestPointResult {
  const rows = rec.rows;
  if (rows.length === 1) {
    const p = { ...rows[0] };
    return { point: p, distance: dist3(p, ref) };
  }
  const idx = segmentIndex(rec);
  let seedSeg: SegmentProxy | null = null;
  let seedD = Infinity;
  for (const s of idx.segments) {
    const d = pointToChordDistance(ref, s.a, s.b);
    if (d < seedD) {
      seedD = d;
      seedSeg = s;
    }
  }

  let best: ClosestPointResult | null = seedSeg
    ? (() => {
      const h = closestOnSegment3D(rec, seedSeg!.a, seedSeg!.b, ref);
      return { point: h.point, distance: h.distance };
    })()
    : null;

  for (const s of idx.segments) {
    if (s === seedSeg) continue;
    if (best && pointBoxGap(ref, s) > best.distance + 1e-9) continue;
    const chord = pointToChordDistance(ref, s.a, s.b);
    if (best && Math.max(0, chord - s.bound) > best.distance + 1e-9) continue;
    const hit = closestOnSegment3D(rec, s.a, s.b, ref);
    if (!best || hit.distance < best.distance) best = { point: hit.point, distance: hit.distance };
  }

  for (const p of rows) {
    const d = dist3(p, ref);
    if (!best || d < best.distance) best = { point: { ...p }, distance: d };
  }
  if (!best) throw new Error('Well contains no survey stations.');
  return best;
}

export const closest3D = closestPointToWell3D;

export function radiusRoot(rec: WellRecord, a: SurveyStation, b: SurveyStation, ref: Point3D, radius: number, lo: number, hi: number): number {
  let flo = dist3(segmentStation(rec, a, b, lo), ref) - radius;
  let fhi = dist3(segmentStation(rec, a, b, hi), ref) - radius;
  if (Math.abs(flo) < 1e-9) return lo;
  if (Math.abs(fhi) < 1e-9) return hi;
  for (let k = 0; k < 32 && hi - lo > 1e-6; k++) {
    const mid = (lo + hi) / 2;
    const fm = dist3(segmentStation(rec, a, b, mid), ref) - radius;
    if ((flo <= 0 && fm <= 0) || (flo > 0 && fm > 0)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
      fhi = fm;
    }
  }
  return (lo + hi) / 2;
}

export function formatIntervals(intervals: Interval[], factor = 1): string {
  const fmt1 = (v: number): string => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return intervals.map(it => `${fmt1(it.from * factor)}–${fmt1(it.to * factor)}`).join('; ');
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  intervals.sort((x, y) => x.from - y.from);
  const merged: Interval[] = [];
  for (const it of intervals) {
    if (!merged.length || it.from > merged[merged.length - 1].to + 1e-4) merged.push({ from: it.from, to: it.to });
    else merged[merged.length - 1].to = Math.max(merged[merged.length - 1].to, it.to);
  }
  return merged;
}

export function inRadiusIntervals3D(rec: WellRecord, ref: Point3D, radius: number): Interval[] {
  const intervals: Interval[] = [];
  const rows = rec.rows;
  const eps = 1e-7;
  if (rows.length === 1) {
    if (dist3(rows[0], ref) <= radius + eps) intervals.push({ from: rows[0].MD, to: rows[0].MD });
    return intervals;
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const da = dist3(a, ref);
    const db = dist3(b, ref);
    const ia = da <= radius + eps;
    const ib = db <= radius + eps;
    if (ia && ib) intervals.push({ from: a.MD, to: b.MD });
    else if (ia !== ib) {
      const root = radiusRoot(rec, a, b, ref, radius, a.MD, b.MD);
      intervals.push(ia ? { from: a.MD, to: root } : { from: root, to: b.MD });
    } else {
      const mn = closestOnSegment3D(rec, a, b, ref);
      if (mn.distance < radius - eps && mn.md > a.MD + 1e-8 && mn.md < b.MD - 1e-8) {
        const r1 = radiusRoot(rec, a, b, ref, radius, a.MD, mn.md);
        const r2 = radiusRoot(rec, a, b, ref, radius, mn.md, b.MD);
        if (r2 >= r1) intervals.push({ from: r1, to: r2 });
      } else if (Math.abs(mn.distance - radius) <= eps) intervals.push({ from: mn.md, to: mn.md });
    }
  }
  return mergeIntervals(intervals);
}

export function minBoxDistance(rec: WellRecord, p: Point3D, mode: '2d' | '3d'): number {
  const dx = p.X < rec.xMin ? rec.xMin - p.X : p.X > rec.xMax ? p.X - rec.xMax : 0;
  const dy = p.Y < rec.yMin ? rec.yMin - p.Y : p.Y > rec.yMax ? p.Y - rec.yMax : 0;
  if (mode === '2d') return Math.hypot(dx, dy);
  const dz = p.Z < rec.zMin ? rec.zMin - p.Z : p.Z > rec.zMax ? p.Z - rec.zMax : 0;
  return Math.hypot(dx, dy, dz);
}

export interface ChordSeed {
  s: number;
  t: number;
  d: number;
}

export function chordSeed(a0: Point3D, a1: Point3D, b0: Point3D, b1: Point3D): ChordSeed {
  const ux = a1.X - a0.X;
  const uy = a1.Y - a0.Y;
  const uz = a1.Z - a0.Z;
  const vx = b1.X - b0.X;
  const vy = b1.Y - b0.Y;
  const vz = b1.Z - b0.Z;
  const wx = a0.X - b0.X;
  const wy = a0.Y - b0.Y;
  const wz = a0.Z - b0.Z;
  const aa = ux * ux + uy * uy + uz * uz;
  const bb = ux * vx + uy * vy + uz * vz;
  const cc = vx * vx + vy * vy + vz * vz;
  const dd = ux * wx + uy * wy + uz * wz;
  const ee = vx * wx + vy * wy + vz * wz;
  let s = 0;
  let t = 0;
  const den = aa * cc - bb * bb;
  if (aa < 1e-12 && cc < 1e-12) return { s: 0, t: 0, d: dist3(a0, b0) };
  if (aa < 1e-12) {
    s = 0;
    t = Math.max(0, Math.min(1, ee / cc));
  } else if (cc < 1e-12) {
    t = 0;
    s = Math.max(0, Math.min(1, -dd / aa));
  } else {
    if (Math.abs(den) > 1e-12) {
      s = Math.max(0, Math.min(1, (bb * ee - cc * dd) / den));
      t = Math.max(0, Math.min(1, (aa * ee - bb * dd) / den));
    }
    for (let k = 0; k < 4; k++) {
      s = Math.max(0, Math.min(1, (bb * t - dd) / aa));
      t = Math.max(0, Math.min(1, (bb * s + ee) / cc));
    }
  }
  const pa = { X: a0.X + s * ux, Y: a0.Y + s * uy, Z: a0.Z + s * uz };
  const pb = { X: b0.X + t * vx, Y: b0.Y + t * vy, Z: b0.Z + t * vz };
  return { s, t, d: dist3(pa, pb) };
}

export function refineSegmentPair3D(
  recA: WellRecord,
  a0: SurveyStation,
  a1: SurveyStation,
  recB: WellRecord,
  b0: SurveyStation,
  b1: SurveyStation,
  seed: ChordSeed,
): ClosestPairResult {
  let ma = lerp(a0.MD, a1.MD, seed.s);
  let mb = lerp(b0.MD, b1.MD, seed.t);
  for (let k = 0; k < 10; k++) {
    const pb = segmentStation(recB, b0, b1, mb);
    ma = closestOnSegment3D(recA, a0, a1, pb).md;
    const pa = segmentStation(recA, a0, a1, ma);
    mb = closestOnSegment3D(recB, b0, b1, pa).md;
  }
  const pa = segmentStation(recA, a0, a1, ma);
  const pb = segmentStation(recB, b0, b1, mb);
  return { a: pa, b: pb, distance: dist3(pa, pb) };
}

export function closestPair3D(recA: WellRecord, recB: WellRecord): ClosestPairResult {
  if (recA.rows.length === 1 && recB.rows.length === 1) {
    return { a: { ...recA.rows[0] }, b: { ...recB.rows[0] }, distance: dist3(recA.rows[0], recB.rows[0]) };
  }
  if (recA.rows.length === 1) {
    const hit = closestPointToWell3D(recB, recA.rows[0]);
    return { a: { ...recA.rows[0] }, b: hit.point, distance: hit.distance };
  }
  if (recB.rows.length === 1) {
    const hit = closestPointToWell3D(recA, recB.rows[0]);
    return { a: hit.point, b: { ...recB.rows[0] }, distance: hit.distance };
  }

  const A = segmentIndex(recA).segments;
  const B = segmentIndex(recB).byX;
  let cheap: { sa: SegmentProxy; sb: SegmentProxy; seed: ChordSeed } | null = null;
  for (const sa of A) {
    for (const sb of B) {
      const seed = chordSeed(sa.a, sa.b, sb.a, sb.b);
      if (!cheap || seed.d < cheap.seed.d) cheap = { sa, sb, seed };
    }
  }
  let best: ClosestPairResult | null = cheap
    ? refineSegmentPair3D(recA, cheap.sa.a, cheap.sa.b, recB, cheap.sb.a, cheap.sb.b, cheap.seed)
    : null;

  const tryPair = (sa: SegmentProxy, sb: SegmentProxy): void => {
    if (best && segmentBoxGap(sa, sb) > best.distance + 1e-9) return;
    const seed = chordSeed(sa.a, sa.b, sb.a, sb.b);
    const conservative = Math.max(0, seed.d - sa.bound - sb.bound);
    if (best && conservative > best.distance + 1e-9) return;
    const r = refineSegmentPair3D(recA, sa.a, sa.b, recB, sb.a, sb.b, seed);
    if (!best || r.distance < best.distance) best = r;
  };

  for (const sa of A) {
    const reach = best ? best.distance : Infinity;
    for (const sb of B) {
      if (best && sb.minX > sa.maxX + reach) break;
      if (best && sb.maxX < sa.minX - reach) continue;
      if (cheap && sa === cheap.sa && sb === cheap.sb) continue;
      tryPair(sa, sb);
    }
  }
  if (!best) throw new Error('Unable to calculate closest well pair.');
  return best;
}

export function pairAtElevation(recA: WellRecord, recB: WellRecord, z: number): ClosestPairResult & { z: number } | null {
  const pa = pointsAtElevation(recA, z);
  const pb = pointsAtElevation(recB, z);
  let best: (ClosestPairResult & { z: number }) | null = null;
  for (const a of pa) {
    for (const b of pb) {
      const d = dist2(a, b);
      if (!best || d < best.distance) best = { a, b, distance: d, z };
    }
  }
  return best;
}

export function referenceProfileMDs(rec: WellRecord): number[] {
  const stepM = 1 / FT;
  const out: number[] = [];
  if (!Number.isFinite(rec.mdMin) || !Number.isFinite(rec.mdMax) || rec.mdMax < rec.mdMin) return out;
  let md = rec.mdMin;
  let guard = 0;
  while (md <= rec.mdMax + 1e-9 && guard < 50000) {
    out.push(Math.min(md, rec.mdMax));
    md += stepM;
    guard++;
  }
  if (!out.length || Math.abs(out[out.length - 1] - rec.mdMax) > 1e-7) out.push(rec.mdMax);
  return out;
}

export function wellBoxGap(a: WellRecord, b: WellRecord): number {
  const dx = a.xMax < b.xMin ? b.xMin - a.xMax : b.xMax < a.xMin ? a.xMin - b.xMax : 0;
  const dy = a.yMax < b.yMin ? b.yMin - a.yMax : b.yMax < a.yMin ? a.yMin - b.yMax : 0;
  const dz = a.zMax < b.zMin ? b.zMin - a.zMax : b.zMax < a.zMin ? a.zMin - b.zMax : 0;
  return Math.hypot(dx, dy, dz);
}

export function distancePointToWell3D(rec: WellRecord, p: Point3D): number {
  return closestPointToWell3D(rec, p).distance;
}

export function closestCourseToWell3D(offRec: WellRecord, a: SurveyStation, b: SurveyStation, refRec: WellRecord): ClosestPairResult {
  if (refRec.rows.length === 1) {
    const hit = closestOnSegment3D(offRec, a, b, refRec.rows[0]);
    return { a: hit.point, b: { ...refRec.rows[0] }, distance: hit.distance };
  }
  const sa = makeSegmentProxy(offRec, a, b, -1);
  const idx = segmentIndex(refRec);
  let cheap: { sb: SegmentProxy; seed: ChordSeed } | null = null;
  for (const sb of idx.segments) {
    const seed = chordSeed(sa.a, sa.b, sb.a, sb.b);
    if (!cheap || seed.d < cheap.seed.d) cheap = { sb, seed };
  }
  let best: ClosestPairResult | null = cheap
    ? refineSegmentPair3D(offRec, a, b, refRec, cheap.sb.a, cheap.sb.b, cheap.seed)
    : null;
  for (const sb of idx.segments) {
    if (cheap && sb === cheap.sb) continue;
    if (best && segmentBoxGap(sa, sb) > best.distance + 1e-9) continue;
    const seed = chordSeed(sa.a, sa.b, sb.a, sb.b);
    const conservative = Math.max(0, seed.d - sa.bound - sb.bound);
    if (best && conservative > best.distance + 1e-9) continue;
    const r = refineSegmentPair3D(offRec, a, b, refRec, sb.a, sb.b, seed);
    if (!best || r.distance < best.distance) best = r;
  }
  if (!best) throw new Error('Unable to calculate course-to-well distance.');
  return best;
}

export function corridorRoot(refRec: WellRecord, offRec: WellRecord, radius: number, lo: number, hi: number): number {
  let flo = distancePointToWell3D(refRec, stationAtMD(offRec, lo)) - radius;
  for (let k = 0; k < 26 && hi - lo > 1e-6; k++) {
    const mid = (lo + hi) / 2;
    const fm = distancePointToWell3D(refRec, stationAtMD(offRec, mid)) - radius;
    if ((flo <= 0 && fm <= 0) || (flo > 0 && fm > 0)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

export function corridorIntervals3D(refRec: WellRecord, offRec: WellRecord, radius: number, closestHit?: ClosestPairResult | null): Interval[] {
  const intervals: Interval[] = [];
  const eps = 1e-7;
  const rows = offRec.rows;
  if (rows.length === 1) {
    if (distancePointToWell3D(refRec, rows[0]) <= radius + eps) intervals.push({ from: rows[0].MD, to: rows[0].MD });
    return intervals;
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const da = distancePointToWell3D(refRec, a);
    const db = distancePointToWell3D(refRec, b);
    const ia = da <= radius + eps;
    const ib = db <= radius + eps;
    if (ia !== ib) {
      const root = corridorRoot(refRec, offRec, radius, a.MD, b.MD);
      intervals.push(ia ? { from: a.MD, to: root } : { from: root, to: b.MD });
      continue;
    }
    if (!ia && !ib) {
      const mn = closestCourseToWell3D(offRec, a, b, refRec);
      if (mn.distance < radius - eps && mn.a.MD > a.MD + 1e-9 && mn.a.MD < b.MD - 1e-9) {
        const r1 = corridorRoot(refRec, offRec, radius, a.MD, mn.a.MD);
        const r2 = corridorRoot(refRec, offRec, radius, mn.a.MD, b.MD);
        if (r2 >= r1) intervals.push({ from: r1, to: r2 });
      } else if (Math.abs(mn.distance - radius) <= eps) intervals.push({ from: mn.a.MD, to: mn.a.MD });
      continue;
    }

    const nodes = [a.MD, lerp(a.MD, b.MD, 0.25), lerp(a.MD, b.MD, 0.5), lerp(a.MD, b.MD, 0.75), b.MD];
    const vals = nodes.map(md => distancePointToWell3D(refRec, stationAtMD(offRec, md)) - radius);
    let start: number | null = nodes[0];
    for (let k = 0; k < nodes.length - 1; k++) {
      const in0 = vals[k] <= 0;
      const in1 = vals[k + 1] <= 0;
      if (in0 && in1) continue;
      if (in0 && !in1) {
        const root = corridorRoot(refRec, offRec, radius, nodes[k], nodes[k + 1]);
        intervals.push({ from: start!, to: root });
        start = null;
      } else if (!in0 && in1) {
        const root = corridorRoot(refRec, offRec, radius, nodes[k], nodes[k + 1]);
        start = root;
      }
    }
    if (start != null) intervals.push({ from: start, to: b.MD });
  }
  const merged = mergeIntervals(intervals);
  if (!merged.length && closestHit && closestHit.distance <= radius + eps) {
    merged.push({ from: closestHit.b.MD, to: closestHit.b.MD });
  }
  return merged;
}

export interface DistanceProfilePoint {
  ft: number;
  distance: number;
}

export function buildOffsetDistanceProfiles(refRec: WellRecord, offRec: WellRecord, intervals: Interval[]): DistanceProfilePoint[][] {
  const profiles: DistanceProfilePoint[][] = [];
  for (const it of intervals || []) {
    const from = Math.max(offRec.mdMin, Math.min(it.from, it.to));
    const to = Math.min(offRec.mdMax, Math.max(it.from, it.to));
    if (to < from - 1e-9) continue;
    const mds = [from];
    const firstFt = Math.ceil(from * FT - 1e-9);
    const lastFt = Math.floor(to * FT + 1e-9);
    for (let ft = firstFt; ft <= lastFt; ft++) {
      const md = ft / FT;
      if (md > from + 1e-8 && md < to - 1e-8) mds.push(md);
    }
    if (to > from + 1e-8) mds.push(to);
    const seg: DistanceProfilePoint[] = [];
    for (const md of mds) {
      const p = stationAtMD(offRec, md);
      const distance = distancePointToWell3D(refRec, p);
      if (Number.isFinite(distance)) seg.push({ ft: md * FT, distance });
    }
    if (seg.length) profiles.push(seg);
  }
  return profiles;
}
