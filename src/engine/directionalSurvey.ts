import { AppError } from './errors';
import { mcmDelta } from './minimumCurvature';
import type { DirectionalSurveyStation, DirectionalTieIn, SurveyStation } from '../types/survey';

/**
 * Reconstruct X/Y/Z/TVD forward and backward from an exact imported tie-in station.
 * This is the WTM 4.3 reconstruction algorithm, separated from Database Manager UI.
 */
export function reconstructDirectionalSurvey(
  directionalRows: DirectionalSurveyStation[],
  tie: DirectionalTieIn,
): SurveyStation[] {
  const well = String(tie.well || '').trim();
  if (!well) throw new AppError('Well Name is required.');
  const vals = [tie.X, tie.Y, tie.Z, tie.TVD].map(Number);
  if (!vals.every(Number.isFinite)) {
    throw new AppError('Tie-in X, Y, elevation/Z and TVD must all be numeric.');
  }

  const md = Number(tie.MD);
  const idx = directionalRows.findIndex(r => Math.abs(r.MD - md) < 1e-7);
  if (idx < 0) throw new AppError('Tie-in MD must match one of the imported directional-survey stations.');

  const rows = directionalRows.map(r => ({
    Well: well,
    MD: r.MD,
    X: Number.NaN,
    Y: Number.NaN,
    Z: Number.NaN,
    TVD: Number.NaN,
    Azimuth: r.Azimuth,
    Inclination: r.Inclination,
    SURV_Type: r.SURV_Type,
    BHT: r.BHT,
    NOTES: r.NOTES,
  }));

  rows[idx].X = vals[0];
  rows[idx].Y = vals[1];
  rows[idx].Z = vals[2];
  rows[idx].TVD = vals[3];

  for (let i = idx + 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const d = mcmDelta(a.MD, a.Inclination, a.Azimuth, b.MD, b.Inclination, b.Azimuth);
    b.X = a.X + d.dE;
    b.Y = a.Y + d.dN;
    b.TVD = a.TVD + d.dTVD;
    b.Z = a.Z - d.dTVD;
  }
  for (let i = idx - 1; i >= 0; i--) {
    const a = rows[i];
    const b = rows[i + 1];
    const d = mcmDelta(a.MD, a.Inclination, a.Azimuth, b.MD, b.Inclination, b.Azimuth);
    a.X = b.X - d.dE;
    a.Y = b.Y - d.dN;
    a.TVD = b.TVD - d.dTVD;
    a.Z = b.Z + d.dTVD;
  }

  return rows;
}
