import type { DirectionalSurveyStation, SurveyStation } from './survey';

export interface QCIssue {
  Type: 'Conflicting duplicate MD' | 'Geometry closure' | string;
  Well: string;
  'MD From': number | '';
  'MD To': number | '';
  Residual: number | '';
  Tolerance: number | '';
  Note: string;
}

export interface ImportReport {
  dropped: number;
  derived: number;
  duplicates: number;
  conflicts: number;
  geometryWarnings: number;
  conflictExamples: string[];
  qcIssues: QCIssue[];
}

export interface DatabaseMeta {
  project: string;
  crs: string;
}

export interface DatabaseStats {
  wells: number;
  stations: number;
  maxMD: number;
  longest: string;
  lastImport: string;
}

export type AppendMode = 'skip' | 'replace' | 'rename';

export interface ReplaceResult {
  wells: number;
  stations: number;
}

export interface AppendResult {
  added: number;
  replaced: number;
  skipped: number;
  renamed: number;
  newStations: number;
}

export interface ImportSource {
  fileName: string;
  directional: boolean;
}

export interface ParsedFullTrajectory {
  kind: 'full';
  stations: SurveyInputStation[];
  dropped: number;
}

export interface DirectionalSurveyGroup {
  suggestedWell: string;
  rows: DirectionalSurveyStation[];
  duplicates: number;
}

export interface ParsedDirectionalSurvey {
  kind: 'directional';
  groups: DirectionalSurveyGroup[];
  dropped: number;
  totalStations: number;
}

export type ParsedTrajectoryInput = ParsedFullTrajectory | ParsedDirectionalSurvey;

/**
 * Import-time station. WTM 4.3 allows Inclination/Azimuth to be absent for a
 * full XYZ/TVD survey and derives them during database finalisation.
 */
export interface SurveyInputStation {
  Well: string;
  MD: number;
  X: number;
  Y: number;
  Z: number;
  TVD: number;
  Azimuth: number | null;
  Inclination: number | null;
  Derived?: boolean;
}

export interface EditableSurveyRow {
  MD: string | number;
  X: string | number;
  Y: string | number;
  Z: string | number;
  TVD: string | number;
  Azimuth: string | number;
  Inclination: string | number;
}

export interface RenderBuffers {
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  md: Float64Array;
  tvd: Float64Array;
  inc: Float64Array;
  azi: Float64Array;
  dls: Float64Array;
  dlsMax: number;
  dlsAvg: number;
}

export interface DatabaseSnapshot {
  names: string[];
  stationCount: number;
  lastImport: string;
  importReport: ImportReport | null;
  meta: DatabaseMeta;
  origin: { x: number; y: number };
  revision: number;
}

export interface DirectionalTieInDraft {
  well: string;
  MD: number;
  X: number;
  Y: number;
  Z: number;
  TVD: number;
}

export interface ImportFileResult {
  stations: SurveyStation[] | SurveyInputStation[];
  fileName: string;
  directional: boolean;
  dropped: number;
}
