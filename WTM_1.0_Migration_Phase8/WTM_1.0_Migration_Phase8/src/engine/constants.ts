/** Exact constants used by WTM 4.3. */
export const FT = 3.280839895013123;
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const toMeters = (v: number, unit: 'm' | 'ft'): number => (unit === 'ft' ? v / FT : v);
export const fromMeters = (v: number, unit: 'm' | 'ft'): number => (unit === 'ft' ? v * FT : v);
