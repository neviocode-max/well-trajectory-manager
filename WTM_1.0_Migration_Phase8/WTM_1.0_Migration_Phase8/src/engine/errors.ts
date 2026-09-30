function fmt(v: number, d = 3): string {
  if (!Number.isFinite(v)) return String(v);
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
}

export class AppError extends Error {}

export interface RangeErrorInfo {
  well: string;
  requested: number;
  unit: string;
  min: number;
  max: number;
}

export class RangeErrorWTC extends Error implements RangeErrorInfo {
  well: string;
  requested: number;
  unit: string;
  min: number;
  max: number;

  constructor(info: RangeErrorInfo) {
    super('Value outside surveyed range');
    this.name = 'RangeErrorWTC';
    this.well = info.well;
    this.requested = info.requested;
    this.unit = info.unit;
    this.min = info.min;
    this.max = info.max;
  }
}

export interface AmbiguousDepthInfo {
  well: string;
  requested: number;
  unit: string;
  solutions: number[];
}

export class AmbiguousDepthError extends Error implements AmbiguousDepthInfo {
  well: string;
  requested: number;
  unit: string;
  solutions: number[];

  constructor(info: AmbiguousDepthInfo) {
    const sols = info.solutions.map(v => `${fmt(v, 3)} mMD`).join(', ');
    super(`${info.solutions.length} matching trajectory positions found for ${fmt(info.requested, 3)} ${info.unit}: ${sols}. Use mMD/ftMD to select the intended branch.`);
    this.name = 'AmbiguousDepthError';
    this.well = info.well;
    this.requested = info.requested;
    this.unit = info.unit;
    this.solutions = info.solutions;
  }
}
