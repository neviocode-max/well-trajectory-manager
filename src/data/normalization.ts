import { FT } from '../engine/constants';
import { pickSurveyValue as pick } from './surveyTemplate';
import { AppError } from '../engine/errors';
import type {
  ParsedDirectionalSurvey,
  ParsedFullTrajectory,
  SurveyInputStation,
} from '../types/database';
import type { RawRow } from '../services/delimited';

const FULL_ALIASES = {
  Well: ['WELL_NAME', 'Well', 'WELL', 'well', 'Wellbore', 'Well Name'],
  MD: ['DEPTH_m', 'mMD', 'MD', 'md', 'MD (m)', 'Measured Depth'],
  X: ['UTM_E', 'X', 'x', 'E-W', 'Easting', 'East'],
  Y: ['UTM_N', 'Y', 'y', 'N-S', 'Northing', 'North'],
  Z: ['Z', 'z', 'BSL', 'ASL', 'Elevation'],
  TVD: ['TVD', 'tvd', 'TVD (m)'],
  Azimuth: ['Azimuth', 'AZI', 'Azi', 'azimuth'],
  Inclination: ['DEV_ANGLE', 'Inclination', 'INC', 'Inc', 'inclination'],
} as const;

function numeric(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number.parseFloat(String(value).replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function measuredDepth(row: RawRow): number | null {
  const meters = numeric(pick(row, FULL_ALIASES.MD));
  const feet = numeric(pick(row, ['DEPTH_ft', 'ftMD']));
  return meters ?? (feet == null ? null : feet / FT);
}

function inclination(row: RawRow): number | null {
  const inc = numeric(pick(row, FULL_ALIASES.Inclination));
  const dip = numeric(pick(row, ['DIP']));
  if (dip != null && (dip < -90 || dip > 90)) throw new AppError('DIP must be between −90° and 90°.');
  if (inc != null && dip != null && Math.abs(inc + dip - 90) > 0.01) {
    throw new AppError('DEV_ANGLE and DIP must satisfy DIP = 90 − DEV_ANGLE.');
  }
  return inc ?? (dip == null ? null : 90 - dip);
}

function metadata(row: RawRow) {
  return { SURV_Type: pick(row, ['SURV_Type']) ?? '', BHT: pick(row, ['BHT']) ?? '' };
}

function feetOrMeters(row: RawRow, feetName: string, meterNames: readonly string[]): number | null {
  const feet = numeric(pick(row, [feetName]));
  return feet == null ? numeric(pick(row, meterNames)) : feet / FT;
}

export function normalizeFullTrajectory(rawRows: RawRow[]): ParsedFullTrajectory {
  const stations: SurveyInputStation[] = [];
  let dropped = 0;

  for (const row of rawRows) {
    const well = String(pick(row, FULL_ALIASES.Well) ?? '').trim();
    if (!well) {
      dropped++;
      continue;
    }

    const station: SurveyInputStation = {
      Well: well,
      MD: measuredDepth(row) as number,
      X: numeric(pick(row, FULL_ALIASES.X)) as number,
      Y: numeric(pick(row, FULL_ALIASES.Y)) as number,
      Z: feetOrMeters(row, 'ELEV_FT', FULL_ALIASES.Z) as number,
      TVD: feetOrMeters(row, 'DEPTH_VERT', FULL_ALIASES.TVD) as number,
      Azimuth: numeric(pick(row, FULL_ALIASES.Azimuth)),
      Inclination: inclination(row),
      ...metadata(row),
    };

    if (station.Inclination != null && (station.Inclination < 0 || station.Inclination > 180)) {
      const mdText = Number.isFinite(station.MD) ? ` at ${station.MD.toFixed(3)} mMD` : '';
      throw new AppError(`Invalid inclination for ${well}${mdText}. Inclination must be between 0° and 180°.`);
    }
    if (station.Azimuth != null) station.Azimuth = ((station.Azimuth % 360) + 360) % 360;

    if ([station.MD, station.X, station.Y, station.Z, station.TVD].every(Number.isFinite)) {
      stations.push(station);
    } else {
      dropped++;
    }
  }

  return { kind: 'full', stations, dropped };
}

export function parseDirectionalSurvey(rawRows: RawRow[]): ParsedDirectionalSurvey | null {
  const parsed: Array<{ Well: string; MD: number; Azimuth: number; Inclination: number; SURV_Type: string; BHT: string }> = [];
  let dropped = 0;
  let hasNamed = false;

  for (const row of rawRows) {
    const MD = measuredDepth(row);
    const Azimuth = numeric(pick(row, FULL_ALIASES.Azimuth));
    const Inclination = inclination(row);
    const Well = String(pick(row, FULL_ALIASES.Well) ?? '').trim();
    if (MD == null || Azimuth == null || Inclination == null) {
      dropped++;
      continue;
    }
    if (Inclination < 0 || Inclination > 180) throw new AppError('Inclination must be between 0° and 180°.');
    if (Well) hasNamed = true;
    parsed.push({ Well, MD, Azimuth: ((Azimuth % 360) + 360) % 360, Inclination, ...metadata(row) });
  }

  if (!parsed.length) return null;

  const groups = new Map<string, { suggestedWell: string; rows: typeof parsed; duplicates: number }>();
  for (const row of parsed) {
    if (hasNamed && !row.Well) {
      dropped++;
      continue;
    }
    const key = hasNamed ? row.Well.toLowerCase() : '__single__';
    let group = groups.get(key);
    if (!group) {
      group = { suggestedWell: hasNamed ? row.Well : '', rows: [], duplicates: 0 };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  const output: ParsedDirectionalSurvey['groups'] = [];
  for (const group of groups.values()) {
    group.rows.sort((a, b) => a.MD - b.MD);
    const clean: ParsedDirectionalSurvey['groups'][number]['rows'] = [];
    for (const row of group.rows) {
      if (clean.length && Math.abs(clean[clean.length - 1].MD - row.MD) < 1e-9) {
        group.duplicates++;
        continue;
      }
      clean.push({ MD: row.MD, Azimuth: row.Azimuth, Inclination: row.Inclination, SURV_Type: row.SURV_Type, BHT: row.BHT });
    }
    if (clean.length) {
      output.push({
        rows: clean,
        suggestedWell: group.suggestedWell,
        duplicates: group.duplicates,
      });
    }
  }

  if (!output.length) return null;
  output.sort((a, b) => (a.suggestedWell || '').localeCompare(
    b.suggestedWell || '',
    undefined,
    { numeric: true, sensitivity: 'base' },
  ));

  return {
    kind: 'directional',
    groups: output,
    dropped,
    totalStations: output.reduce((n, group) => n + group.rows.length, 0),
  };
}

function hasAlias(keys: string[], aliases: readonly string[]): boolean {
  return aliases.some(alias => keys.some(key => key.trim().toLowerCase() === alias.toLowerCase()));
}

export function invalidImportMessage(rawRows: RawRow[]): string {
  if (!rawRows.length) return 'The file contains no data rows.';
  const keys = Object.keys(rawRows[0]);
  const fullReq: Array<[string, readonly string[]]> = [
    ['Well', FULL_ALIASES.Well],
    ['DEPTH_m / DEPTH_ft', [...FULL_ALIASES.MD, 'DEPTH_ft', 'ftMD']],
    ['X / Easting', FULL_ALIASES.X],
    ['Y / Northing', FULL_ALIASES.Y],
    ['ELEV_FT', [...FULL_ALIASES.Z, 'ELEV_FT']],
    ['DEPTH_VERT', [...FULL_ALIASES.TVD, 'DEPTH_VERT']],
  ];
  const dirReq: Array<[string, readonly string[]]> = [
    ['DEPTH_m / DEPTH_ft', [...FULL_ALIASES.MD, 'DEPTH_ft', 'ftMD']],
    ['Azimuth', FULL_ALIASES.Azimuth],
    ['DEV_ANGLE / DIP', [...FULL_ALIASES.Inclination, 'DIP']],
  ];
  const missingFull = fullReq.filter(([, aliases]) => !hasAlias(keys, aliases)).map(([label]) => label);
  const missingDir = dirReq.filter(([, aliases]) => !hasAlias(keys, aliases)).map(([label]) => label);

  let detail = 'No valid trajectory rows found.';
  detail += missingFull.length
    ? ` Full trajectory missing: ${missingFull.join(', ')}.`
    : ' Full-trajectory columns were found, but no row contained all required numeric values.';
  detail += missingDir.length
    ? ` Directional survey missing: ${missingDir.join(', ')}.`
    : ' Directional-survey columns were found, but no row contained valid MD/Azimuth/Inclination values.';
  return detail;
}
