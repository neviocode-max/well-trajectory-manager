import { FT } from '../engine/constants';
import type { SurveyStation } from '../types/survey';
import type { RawRow } from '../services/delimited';

/** Shared column order for database files and the Data Viewer. */
export const SURVEY_TEMPLATE_KEYS = [
  'WELL_NAME', 'DEPTH_ft', 'DEPTH_m', 'DEV_ANGLE', 'AZIMUTH', 'DIP',
  'SURV_Type', 'BHT', 'UTM_E', 'UTM_N', 'DEPTH_VERT', 'ELEV_FT', 'NOTES',
];

export function pickSurveyValue(row: RawRow, names: readonly string[]): string | null {
  const entries = Object.entries(row);
  for (const name of names) {
    const entry = entries.find(([key, value]) => key.trim().toLowerCase() === name.toLowerCase() && value.trim() !== '');
    if (entry) return entry[1];
  }
  return null;
}

export function surveyTemplateRow(station: SurveyStation): Record<string, string | number> {
  return {
    WELL_NAME: station.Well,
    DEPTH_ft: station.MD * FT,
    DEPTH_m: station.MD,
    DEV_ANGLE: station.Inclination,
    AZIMUTH: station.Azimuth,
    DIP: 90 - station.Inclination,
    SURV_Type: station.SURV_Type ?? '',
    BHT: station.BHT ?? '',
    UTM_E: station.X,
    UTM_N: station.Y,
    DEPTH_VERT: station.TVD * FT,
    ELEV_FT: station.Z * FT,
    NOTES: station.NOTES ?? '',
  };
}
