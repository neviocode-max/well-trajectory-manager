import { FT } from '../engine/constants';
import { AmbiguousDepthError, RangeErrorWTC } from '../engine/errors';
import {
  convertRecord,
  displayedEndpointTolerance,
  rangeFor,
  solveMD,
  stationAtMD,
  TYPES,
  type ConversionOutput,
  type TrajectoryInputType,
} from '../engine/trajectory';
import type { WellRecord } from '../types/well';

export interface ConverterRowState {
  well: string;
  input: string;
  output: ConversionOutput | null;
  error: string;
}

export interface SplitRow extends Record<string, string | number> {
  Well: string;
  Type: 'Survey' | 'Interpolated';
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
}

export class SplitAmbiguousError extends Error {
  constructor(
    public count: number,
    public typeLabel: string,
    public value: number,
    public solutions: number[],
  ) {
    super(`${count} requested ${typeLabel} value(s) map to multiple MD positions.`);
    this.name = 'SplitAmbiguousError';
  }
}

export interface SplitOptions {
  type: TrajectoryInputType;
  step: number;
  from?: number | null;
  to?: number | null;
  includeSurvey: boolean;
  limit?: number;
}

export interface SplitResult {
  rows: SplitRow[];
  unresolved: number;
  requestedTargets: number;
  from: number;
  to: number;
}

export function converterErrorMessage(error: unknown): string {
  if (error instanceof RangeErrorWTC) {
    return `Outside range: ${Math.min(error.min, error.max).toFixed(2)}–${Math.max(error.min, error.max).toFixed(2)} ${error.unit}`;
  }
  if (error instanceof AmbiguousDepthError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export function calculateConverterRow(
  record: WellRecord | null,
  requestedWell: string,
  type: TrajectoryInputType,
  rawValue: string,
): ConverterRowState {
  const well = String(requestedWell || '').trim();
  const input = String(rawValue ?? '').trim();
  if (!well && !input) return { well: '', input: '', output: null, error: '' };
  if (!well) return { well, input, output: null, error: 'Select or enter a well.' };
  // WTM 4.3 validates the editable input before asking the database for the well.
  if (!input) return { well, input, output: null, error: `Enter ${type}.` };
  if (!record) return { well, input, output: null, error: `Well "${well}" is not in the database.` };
  const value = Number(input);
  if (!Number.isFinite(value)) return { well, input, output: null, error: 'Invalid numeric value.' };
  try {
    const output = convertRecord(record, type, value);
    return { well: output.Well, input, output, error: '' };
  } catch (error) {
    return { well, input, output: null, error: converterErrorMessage(error) };
  }
}

export function roundedConversion(output: ConversionOutput): Record<string, string | number> {
  return {
    Well: output.Well,
    mMD: +output.mMD.toFixed(3),
    ftMD: +output.ftMD.toFixed(3),
    mTVD: +output.mTVD.toFixed(3),
    ftTVD: +output.ftTVD.toFixed(3),
    mASL: +output.mASL.toFixed(3),
    ftASL: +output.ftASL.toFixed(3),
    X: +output.X.toFixed(3),
    Y: +output.Y.toFixed(3),
    Azimuth: +output.Azimuth.toFixed(3),
    Inclination: +output.Inclination.toFixed(3),
  };
}

export function splitTrajectory(record: WellRecord, options: SplitOptions): SplitResult {
  const t = TYPES[options.type];
  const range = rangeFor(record, options.type);
  const loLimit = Math.min(range.min, range.max);
  const hiLimit = Math.max(range.min, range.max);
  const step = options.step;
  let from = Number.isFinite(options.from as number) ? Number(options.from) : loLimit;
  let to = Number.isFinite(options.to as number) ? Number(options.to) : hiLimit;

  if (!Number.isFinite(step) || step <= 0) throw new Error('Enter a positive interval.');
  if (to < from) [from, to] = [to, from];

  const tolerance = displayedEndpointTolerance(t.unit);
  if (from < loLimit - tolerance || to > hiLimit + tolerance) {
    throw new RangeErrorWTC({
      well: record.name,
      requested: from < loLimit - tolerance ? from : to,
      unit: t.label,
      min: loLimit,
      max: hiLimit,
    });
  }

  const estimated = Math.floor((to - from) / step) + 1;
  const limit = options.limit ?? 50_000;
  if (estimated > limit) throw new Error(`That interval would create ${estimated.toLocaleString()} stations. Use a larger interval (limit ${limit.toLocaleString()}).`);

  const targets: number[] = [];
  for (let value = from; value <= to + 1e-9; value += step) targets.push(Math.min(value, to));
  if (!targets.length || Math.abs(targets[targets.length - 1] - to) > 1e-9) targets.push(to);

  const mds: number[] = [];
  let unresolved = 0;
  const ambiguous: Array<{ value: number; error: AmbiguousDepthError }> = [];
  for (const value of targets) {
    try {
      mds.push(solveMD(record, options.type, value));
    } catch (error) {
      if (error instanceof AmbiguousDepthError) ambiguous.push({ value, error });
      else unresolved++;
    }
  }

  if (ambiguous.length) {
    const first = ambiguous[0];
    throw new SplitAmbiguousError(ambiguous.length, t.label, first.value, first.error.solutions);
  }
  if (!mds.length) throw new Error(`None of the requested ${t.label} values fall on this trajectory.`);

  if (options.includeSurvey) {
    let mdLo = Infinity;
    let mdHi = -Infinity;
    for (const md of mds) {
      if (md < mdLo) mdLo = md;
      if (md > mdHi) mdHi = md;
    }
    for (const station of record.rows) {
      if (station.MD >= mdLo - 1e-9 && station.MD <= mdHi + 1e-9) mds.push(station.MD);
    }
  }
  mds.sort((a, b) => a - b);

  const rows: SplitRow[] = [];
  let previous = Number.NaN;
  for (const md of mds) {
    if (Math.abs(md - previous) < 1e-6) continue;
    previous = md;
    const point = stationAtMD(record, md);
    rows.push({
      Well: record.name,
      Type: record.mdSet.has(md) ? 'Survey' : 'Interpolated',
      mMD: +point.MD.toFixed(3),
      ftMD: +(point.MD * FT).toFixed(3),
      mTVD: +point.TVD.toFixed(3),
      ftTVD: +(point.TVD * FT).toFixed(3),
      mASL: +point.Z.toFixed(3),
      ftASL: +(point.Z * FT).toFixed(3),
      X: +point.X.toFixed(3),
      Y: +point.Y.toFixed(3),
      Azimuth: +point.Azimuth.toFixed(3),
      Inclination: +point.Inclination.toFixed(3),
    });
  }

  return { rows, unresolved, requestedTargets: targets.length, from, to };
}
