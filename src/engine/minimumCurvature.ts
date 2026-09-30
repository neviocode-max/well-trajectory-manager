import { clamp, D2R, lerp, R2D } from './constants';
import type { SurveyStation } from '../types/survey';

export interface DirectionVector {
  n: number;
  e: number;
  v: number;
}

export interface McmDelta {
  dTVD: number;
  dN: number;
  dE: number;
}

export interface McmPartial extends McmDelta {
  Inclination: number;
  Azimuth: number;
}

/** WTM 4.3 dogleg angle, returned in radians. */
export function doglegAngle(inc1: number, azi1: number, inc2: number, azi2: number): number {
  const i1 = inc1 * D2R;
  const i2 = inc2 * D2R;
  const a1 = azi1 * D2R;
  const a2 = azi2 * D2R;
  return Math.acos(clamp(
    Math.cos(i1) * Math.cos(i2) + Math.sin(i1) * Math.sin(i2) * Math.cos(a2 - a1),
    -1,
    1,
  ));
}

export function ratioFactor(dl: number): number {
  return Math.abs(dl) < 1e-12 ? 1 : (2 / dl) * Math.tan(dl / 2);
}

/** Position increments between two stations using the WTM 4.3 minimum-curvature formula. */
export function mcmDelta(
  md1: number,
  inc1: number,
  azi1: number,
  md2: number,
  inc2: number,
  azi2: number,
): McmDelta {
  const dmd = md2 - md1;
  const i1 = inc1 * D2R;
  const i2 = inc2 * D2R;
  const a1 = azi1 * D2R;
  const a2 = azi2 * D2R;
  const rf = ratioFactor(doglegAngle(inc1, azi1, inc2, azi2));
  return {
    dTVD: dmd / 2 * (Math.cos(i1) + Math.cos(i2)) * rf,
    dN: dmd / 2 * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * rf,
    dE: dmd / 2 * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * rf,
  };
}

/** Unit tangent in WTM coordinates: North, East, Down/TVD. */
export function directionVector(inc: number, azi: number): DirectionVector {
  const i = inc * D2R;
  const a = azi * D2R;
  const s = Math.sin(i);
  return { n: s * Math.cos(a), e: s * Math.sin(a), v: Math.cos(i) };
}

export function anglesFromDirection(u: DirectionVector, fallbackAzi: number): { inc: number; azi: number } {
  const h = Math.hypot(u.n, u.e);
  const inc = Math.atan2(h, clamp(u.v, -1, 1)) * R2D;
  const azi = h < 1e-12
    ? ((fallbackAzi % 360) + 360) % 360
    : (Math.atan2(u.e, u.n) * R2D + 360) % 360;
  return { inc, azi };
}

export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/**
 * Exact partial Minimum Curvature displacement at fraction f of a course.
 * Ported formula-for-formula from WTM 4.3.
 */
export function mcmPartial(
  md1: number,
  inc1: number,
  azi1: number,
  md2: number,
  inc2: number,
  azi2: number,
  md: number,
): McmPartial {
  const L = md2 - md1;
  if (!(L > 1e-12)) {
    return {
      dTVD: 0,
      dN: 0,
      dE: 0,
      Inclination: inc1,
      Azimuth: ((azi1 % 360) + 360) % 360,
    };
  }

  const f = clamp((md - md1) / L, 0, 1);
  const u0 = directionVector(inc1, azi1);
  const u1 = directionVector(inc2, azi2);
  const beta = doglegAngle(inc1, azi1, inc2, azi2);

  if (beta < 1e-9) {
    const d = L * f;
    const u = {
      n: lerp(u0.n, u1.n, f),
      e: lerp(u0.e, u1.e, f),
      v: lerp(u0.v, u1.v, f),
    };
    const q = Math.hypot(u.n, u.e, u.v) || 1;
    u.n /= q;
    u.e /= q;
    u.v /= q;
    const ang = anglesFromDirection(u, azi1);
    return { dTVD: d * u0.v, dN: d * u0.n, dE: d * u0.e, Inclination: ang.inc, Azimuth: ang.azi };
  }

  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);
  if (Math.abs(sinB) < 1e-10) {
    const inc = lerp(inc1, inc2, f);
    const azi = lerpAngle(azi1, azi2, f);
    const d = mcmDelta(md1, inc1, azi1, md, inc, azi);
    return { dTVD: d.dTVD, dN: d.dN, dE: d.dE, Inclination: inc, Azimuth: azi };
  }

  const v = {
    n: (u1.n - cosB * u0.n) / sinB,
    e: (u1.e - cosB * u0.e) / sinB,
    v: (u1.v - cosB * u0.v) / sinB,
  };
  const fb = f * beta;
  const coef = L / beta;
  const s = Math.sin(fb);
  const c = Math.cos(fb);
  const dN = coef * (s * u0.n + (1 - c) * v.n);
  const dE = coef * (s * u0.e + (1 - c) * v.e);
  const dTVD = coef * (s * u0.v + (1 - c) * v.v);
  const u = {
    n: c * u0.n + s * v.n,
    e: c * u0.e + s * v.e,
    v: c * u0.v + s * v.v,
  };
  const ang = anglesFromDirection(u, lerpAngle(azi1, azi2, f));
  return { dTVD, dN, dE, Inclination: ang.inc, Azimuth: ang.azi };
}

/**
 * Canonical WTM 4.3 course evaluator. Closure correction is deliberately retained.
 */
export function coursePoint(wellName: string, a: SurveyStation, b: SurveyStation, md: number): SurveyStation {
  if (Math.abs(md - a.MD) < 1e-10) return { ...a };
  if (Math.abs(md - b.MD) < 1e-10) return { ...b };
  const L = b.MD - a.MD;
  if (!(L > 1e-12)) return { ...a };
  const f = clamp((md - a.MD) / L, 0, 1);
  const p = mcmPartial(a.MD, a.Inclination, a.Azimuth, b.MD, b.Inclination, b.Azimuth, md);
  const full = mcmDelta(a.MD, a.Inclination, a.Azimuth, b.MD, b.Inclination, b.Azimuth);
  const pred = {
    X: a.X + full.dE,
    Y: a.Y + full.dN,
    Z: a.Z - full.dTVD,
    TVD: a.TVD + full.dTVD,
  };
  const h = f * f * (3 - 2 * f);
  return {
    Well: wellName,
    MD: md,
    X: a.X + p.dE + (b.X - pred.X) * h,
    Y: a.Y + p.dN + (b.Y - pred.Y) * h,
    Z: a.Z - p.dTVD + (b.Z - pred.Z) * h,
    TVD: a.TVD + p.dTVD + (b.TVD - pred.TVD) * h,
    Azimuth: p.Azimuth,
    Inclination: p.Inclination,
  };
}

export function courseClosureResidual(a: SurveyStation, b: SurveyStation): number {
  const d = mcmDelta(a.MD, a.Inclination, a.Azimuth, b.MD, b.Inclination, b.Azimuth);
  return Math.hypot((a.X + d.dE) - b.X, (a.Y + d.dN) - b.Y, (a.Z - d.dTVD) - b.Z);
}

export function courseSagitta(a: SurveyStation, b: SurveyStation): number {
  const L = b.MD - a.MD;
  const beta = doglegAngle(a.Inclination, a.Azimuth, b.Inclination, b.Azimuth);
  if (!(L > 0) || beta < 1e-10) return 0;
  return (L / beta) * (1 - Math.cos(beta / 2));
}

export function courseDeviationBound(a: SurveyStation, b: SurveyStation): number {
  return courseSagitta(a, b) + courseClosureResidual(a, b) + 1e-6;
}

/** Dogleg severity in degrees per 30 m. */
export function dlsPer30(a: SurveyStation, b: SurveyStation): number {
  const dmd = b.MD - a.MD;
  if (dmd <= 1e-9) return 0;
  return doglegAngle(a.Inclination, a.Azimuth, b.Inclination, b.Azimuth) * R2D * 30 / dmd;
}

/** Reconstruct inclination / azimuth from segment geometry, matching WTM 4.3. */
export function deriveAngles(a: SurveyStation, b: SurveyStation): { inc: number; azi: number | null } {
  const dmd = b.MD - a.MD;
  const inc = dmd > 1e-9 ? Math.acos(clamp((b.TVD - a.TVD) / dmd, -1, 1)) * R2D : 0;
  const dE = b.X - a.X;
  const dN = b.Y - a.Y;
  const azi = Math.abs(dE) < 1e-9 && Math.abs(dN) < 1e-9
    ? null
    : (Math.atan2(dE, dN) * R2D + 360) % 360;
  return { inc, azi };
}
