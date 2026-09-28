import type { RenderBuffers } from '../types/database';
import type { SurveyStation } from '../types/survey';
import type { StudioMeasurement, DlsUnit } from '../types/studio';

export const STUDIO_PALETTE = [
  '#4f9cf9', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#22d3ee',
  '#fb7185', '#84cc16', '#e879f9', '#facc15', '#38bdf8', '#fb923c',
] as const;

export function colorForWell(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return STUDIO_PALETTE[h % STUDIO_PALETTE.length];
}

export function dlsFactor(unit: DlsUnit): number {
  return unit === '100ft' ? 30.48 / 30 : 1;
}

export function dlsUnitLabel(unit: DlsUnit): string {
  return unit === '100ft' ? '°/100ft' : '°/30m';
}

const absoluteCache = new WeakMap<RenderBuffers, { x?: Float64Array; y?: Float64Array }>();

export function absoluteX(buffer: RenderBuffers, originX: number): Float64Array {
  let cached = absoluteCache.get(buffer);
  if (!cached) { cached = {}; absoluteCache.set(buffer, cached); }
  if (!cached.x) {
    cached.x = new Float64Array(buffer.n);
    for (let i = 0; i < buffer.n; i++) cached.x[i] = buffer.x[i] + originX;
  }
  return cached.x;
}

export function absoluteY(buffer: RenderBuffers, originY: number): Float64Array {
  let cached = absoluteCache.get(buffer);
  if (!cached) { cached = {}; absoluteCache.set(buffer, cached); }
  if (!cached.y) {
    cached.y = new Float64Array(buffer.n);
    for (let i = 0; i < buffer.n; i++) cached.y[i] = buffer.y[i] + originY;
  }
  return cached.y;
}

const dlsCache = new WeakMap<RenderBuffers, Map<DlsUnit, Float64Array>>();

export function dlsSeries(buffer: RenderBuffers, unit: DlsUnit): Float64Array {
  let byUnit = dlsCache.get(buffer);
  if (!byUnit) { byUnit = new Map(); dlsCache.set(buffer, byUnit); }
  let cached = byUnit.get(unit);
  if (!cached) {
    const factor = dlsFactor(unit);
    cached = new Float64Array(buffer.n);
    for (let i = 0; i < buffer.n; i++) cached[i] = buffer.dls[i] * factor;
    byUnit.set(unit, cached);
  }
  return cached;
}

export function norm360(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function measureStations(a: SurveyStation, b: SurveyStation): StudioMeasurement {
  const dx = b.X - a.X;
  const dy = b.Y - a.Y;
  const dz = b.Z - a.Z;
  return {
    a,
    b,
    d3: Math.sqrt(dx * dx + dy * dy + dz * dz),
    horiz: Math.sqrt(dx * dx + dy * dy),
    vert: Math.abs(dz),
    bearing: norm360(Math.atan2(dx, dy) * 180 / Math.PI),
    dMD: Math.abs(b.MD - a.MD),
  };
}

export function stationDistance(a: SurveyStation | null | undefined, b: SurveyStation | null | undefined): number | null {
  if (!a || !b) return null;
  return Math.sqrt((a.X - b.X) ** 2 + (a.Y - b.Y) ** 2 + (a.Z - b.Z) ** 2);
}
