import type { RenderBuffers } from './database';
import type { SurveyStation } from './survey';
import type { WellRecord } from './well';

export type StudioViewId = '3d' | 'plan' | 'section' | 'diagnostic';
export type SectionAxis = 'x' | 'y';
export type DiagnosticMode = 'inc' | 'azi' | 'dls';
export type DlsUnit = '30m' | '100ft';

export interface StudioSeries {
  key: string;
  label: string;
  color: string;
  x: Float64Array;
  y: Float64Array;
  n: number;
  rec: WellRecord;
  buf: RenderBuffers;
  primary: boolean;
  width?: number;
  extra?: Record<string, Float64Array>;
}

export interface StudioWell3D {
  key: string;
  label: string;
  color: string;
  rec: WellRecord;
  buf: RenderBuffers;
  primary: boolean;
}

export interface StudioMark2D {
  x: number;
  y: number;
  view: string;
}

export interface StudioMark3D {
  x: number;
  y: number;
  z: number;
}

export interface StudioApproach {
  a: StudioMark3D;
  b: StudioMark3D;
  distance: number;
  ref: string;
  off: string;
}

export interface StudioMeasurement {
  a: SurveyStation;
  b: SurveyStation;
  d3: number;
  horiz: number;
  vert: number;
  bearing: number;
  dMD: number;
}

export interface StudioFocusRequest {
  well: string;
  md?: number;
  token: number;
}

export interface ConverterFocusRequest {
  well: string;
  md?: number;
  token: number;
}
