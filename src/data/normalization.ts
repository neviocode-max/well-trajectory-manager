import { AppError } from '../engine/errors';
import type {
  ParsedDirectionalSurvey,
  ParsedFullTrajectory,
  SurveyInputStation,
} from '../types/database';
import type { RawRow } from '../services/delimited';

const FULL_ALIASES = {
  Well: ['Well', 'WELL', 'well', 'Wellbore', 'Well Name'],
  MD: ['MD', 'md', 'MD (m)', 'Measured Depth'],
  X: ['X', 'x', 'E-W', 'Easting', 'East'],
  Y: ['Y', 'y', 'N-S', 'Northing', 'North'],
  Z: ['Z', 'z', 'BSL', 'ASL', 'Elevation'],
  TVD: ['TVD', 'tvd', 'TVD (m)'],
  Azimuth: ['Azimuth', 'AZI', 'Azi', 'azimuth'],
  Inclination: ['Inclination', 'INC', 'Inc', 'inclination'],
} as const;

function numeric(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number.parseFloat(String(value).replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pick(row: RawRow, names: readonly string[]): string | null {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return row[name];
  }
  return null;
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
      MD: numeric(pick(row, FULL_ALIASES.MD)) as number,
      X: numeric(pick(row, FULL_ALIASES.X)) as number,
      Y: numeric(pick(row, FULL_ALIASES.Y)) as number,
      Z: numeric(pick(row, FULL_ALIASES.Z)) as number,
      TVD: numeric(pick(row, FULL_ALIASES.TVD)) as number,
      Azimuth: numeric(pick(row, FULL_ALIASES.Azimuth)),
      Inclination: numeric(pick(row, FULL_ALIASES.Inclination)),
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
  const parsed: Array<{ Well: string; MD: number; Azimuth: number; Inclination: number }> = [];
  let dropped = 0;
  let hasNamed = false;

  for (const row of rawRows) {
    const MD = numeric(pick(row, FULL_ALIASES.MD));
    const Azimuth = numeric(pick(row, FULL_ALIASES.Azimuth));
    const Inclination = numeric(pick(row, FULL_ALIASES.Inclination));
    const Well = String(pick(row, FULL_ALIASES.Well) ?? '').trim();
    if (MD == null || Azimuth == null || Inclination == null) {
      dropped++;
      continue;
    }
    if (Inclination < 0 || Inclination > 180) throw new AppError('Inclination must be between 0° and 180°.');
    if (Well) hasNamed = true;
    parsed.push({ Well, MD, Azimuth: ((Azimuth % 360) + 360) % 360, Inclination });
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
      clean.push({ MD: row.MD, Azimuth: row.Azimuth, Inclination: row.Inclination });
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
    ['MD', FULL_ALIASES.MD],
    ['X / Easting', FULL_ALIASES.X],
    ['Y / Northing', FULL_ALIASES.Y],
    ['Z / Elevation', FULL_ALIASES.Z],
    ['TVD', FULL_ALIASES.TVD],
  ];
  const dirReq: Array<[string, readonly string[]]> = [
    ['MD', FULL_ALIASES.MD],
    ['Azimuth', FULL_ALIASES.Azimuth],
    ['Inclination', FULL_ALIASES.Inclination],
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
