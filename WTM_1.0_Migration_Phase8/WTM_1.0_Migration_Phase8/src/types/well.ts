import type { RenderBuffers } from './database';
import type { SurveyStation } from './survey';

export interface WellRecord {
  name: string;
  rows: SurveyStation[];
  count: number;
  mdMin: number;
  mdMax: number;
  tvdMin: number;
  tvdMax: number;
  zMin: number;
  zMax: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  mdSet: Set<number>;
  cache: RenderBuffers | null;
}

export interface Point3D {
  X: number;
  Y: number;
  Z: number;
}
