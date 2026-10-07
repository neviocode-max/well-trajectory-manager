import { AppError } from '../engine/errors';
import { courseClosureResidual, deriveAngles, dlsPer30 } from '../engine/minimumCurvature';
import type {
  AppendMode,
  AppendResult,
  DatabaseMeta,
  DatabaseSnapshot,
  DatabaseStats,
  EditableSurveyRow,
  ImportReport,
  QCIssue,
  RenderBuffers,
  ReplaceResult,
  SurveyInputStation,
} from '../types/database';
import type { SurveyStation } from '../types/survey';
import type { WellRecord } from '../types/well';
import { surveyTemplateRow } from './surveyTemplate';
import { fmt } from '../utils/format';

export type DatabaseListener = () => void;

interface BuildResult {
  index: Map<string, WellRecord>;
  report: ImportReport;
}

function emptyReport(dropped = 0): ImportReport {
  return {
    dropped,
    derived: 0,
    duplicates: 0,
    conflicts: 0,
    geometryWarnings: 0,
    conflictExamples: [],
    qcIssues: [],
  };
}

function sameValue(a: number | null | undefined, b: number | null | undefined, tolerance: number): boolean {
  return a == null && b == null
    ? true
    : a != null && b != null && Math.abs(a - b) <= tolerance;
}

function cloneInput(station: SurveyInputStation): SurveyInputStation {
  return { ...station };
}

function normalizeNumeric(value: string | number, label: string, allowBlank: boolean): number | null {
  if (value == null || String(value).trim() === '') {
    if (allowBlank) return null;
    throw new AppError(`${label} cannot be blank.`);
  }
  const number = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(number)) throw new AppError(`${label} must be numeric.`);
  return number;
}

/**
 * In-memory trajectory database ported from WTM 4.3.
 *
 * This class deliberately contains no React or DOM code. The UI subscribes to
 * revision changes while engineering modules can query WellRecord objects directly.
 */
export class WellDatabase {
  private index = new Map<string, WellRecord>();
  private listeners = new Set<DatabaseListener>();
  private revision = 0;
  private cachedSnapshot: DatabaseSnapshot | null = null;

  names: string[] = [];
  stationCount = 0;
  lastImport = '—';
  importReport: ImportReport | null = null;
  meta: DatabaseMeta = { project: '', crs: '' };
  origin = { x: 0, y: 0 };

  subscribe(listener: DatabaseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.revision++;
    this.cachedSnapshot = null;
    for (const listener of this.listeners) listener();
  }

  getSnapshot(): DatabaseSnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot;
    this.cachedSnapshot = {
      names: this.names,
      stationCount: this.stationCount,
      lastImport: this.lastImport,
      importReport: this.importReport,
      meta: this.meta,
      origin: this.origin,
      revision: this.revision,
    };
    return this.cachedSnapshot;
  }

  private buildIndex(stations: SurveyInputStation[], dropped = 0): BuildResult {
    const report = emptyReport(dropped);
    const map = new Map<string, { name: string; rows: SurveyInputStation[] }>();

    for (const source of stations) {
      const station = cloneInput(source);
      const key = station.Well.toLowerCase();
      let record = map.get(key);
      if (!record) {
        record = { name: station.Well, rows: [] };
        map.set(key, record);
      }
      record.rows.push(station);
    }

    const output = new Map<string, WellRecord>();
    for (const [key, record] of map) {
      output.set(key, this.finalizeRecord(record.name, record.rows, report));
    }
    return { index: output, report };
  }

  /** Sort, de-duplicate depths, derive missing angles, run closure QC and cache ranges. */
  private finalizeRecord(name: string, sourceRows: SurveyInputStation[], report: ImportReport): WellRecord {
    const sorted = sourceRows.map(cloneInput).sort((a, b) => a.MD - b.MD);
    const rows: SurveyInputStation[] = [];

    for (const station of sorted) {
      if (rows.length && Math.abs(rows[rows.length - 1].MD - station.MD) < 1e-9) {
        report.duplicates++;
        const previous = rows[rows.length - 1];
        const same = sameValue(previous.X, station.X, 1e-6)
          && sameValue(previous.Y, station.Y, 1e-6)
          && sameValue(previous.Z, station.Z, 1e-6)
          && sameValue(previous.TVD, station.TVD, 1e-6)
          && sameValue(previous.Inclination, station.Inclination, 1e-6)
          && (
            previous.Azimuth == null && station.Azimuth == null
            || previous.Azimuth != null && station.Azimuth != null
              && Math.abs(((previous.Azimuth - station.Azimuth + 540) % 360) - 180) <= 1e-6
          );

        if (!same) {
          report.conflicts++;
          if (report.conflictExamples.length < 5) {
            report.conflictExamples.push(`${name} @ ${fmt(station.MD, 3)} mMD`);
          }
          if (report.qcIssues.length < 500) {
            report.qcIssues.push({
              Type: 'Conflicting duplicate MD',
              Well: name,
              'MD From': station.MD,
              'MD To': station.MD,
              Residual: '',
              Tolerance: '',
              Note: 'Two different survey records share the same MD; the first record was retained.',
            });
          }
        }
        continue;
      }
      rows.push(station);
    }

    for (let i = 0; i < rows.length; i++) {
      const station = rows[i];
      if (station.Inclination != null && station.Azimuth != null) continue;
      const a = i > 0 ? rows[i - 1] : rows[0];
      const b = i > 0 ? station : (rows[1] || rows[0]);
      const derived = deriveAngles(
        a as SurveyStation,
        b as SurveyStation,
      );
      if (station.Inclination == null) station.Inclination = derived.inc;
      if (station.Azimuth == null) station.Azimuth = derived.azi != null
        ? derived.azi
        : (i > 0 ? rows[i - 1].Azimuth ?? 0 : 0);
      station.Derived = true;
      report.derived++;
    }

    const finalRows = rows as SurveyStation[];

    for (let i = 0; i < finalRows.length - 1; i++) {
      const a = finalRows[i];
      const b = finalRows[i + 1];
      const dmd = b.MD - a.MD;
      if (!(dmd > 1e-9) || ![a.Inclination, a.Azimuth, b.Inclination, b.Azimuth].every(Number.isFinite)) continue;
      const residual = courseClosureResidual(a, b);
      const tolerance = Math.max(1, 0.02 * dmd);
      if (residual > tolerance) {
        report.geometryWarnings++;
        if (report.qcIssues.length < 500) {
          report.qcIssues.push({
            Type: 'Geometry closure',
            Well: name,
            'MD From': a.MD,
            'MD To': b.MD,
            Residual: +residual.toFixed(3),
            Tolerance: +tolerance.toFixed(3),
            Note: 'Imported XYZ/TVD endpoint differs materially from the MD/Inclination/Azimuth minimum-curvature course.',
          });
        }
      }
    }

    if (!finalRows.length) throw new AppError(`Well "${name}" contains no valid survey stations.`);

    const first = finalRows[0];
    const last = finalRows[finalRows.length - 1];
    let tvdMin = Infinity;
    let tvdMax = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const station of finalRows) {
      if (station.TVD < tvdMin) tvdMin = station.TVD;
      if (station.TVD > tvdMax) tvdMax = station.TVD;
      if (station.Z < zMin) zMin = station.Z;
      if (station.Z > zMax) zMax = station.Z;
      if (station.X < xMin) xMin = station.X;
      if (station.X > xMax) xMax = station.X;
      if (station.Y < yMin) yMin = station.Y;
      if (station.Y > yMax) yMax = station.Y;
    }

    return {
      name,
      rows: finalRows,
      count: finalRows.length,
      mdMin: first.MD,
      mdMax: last.MD,
      tvdMin,
      tvdMax,
      zMin,
      zMax,
      xMin,
      xMax,
      yMin,
      yMax,
      mdSet: new Set(finalRows.map(station => station.MD)),
      cache: null,
    };
  }

  private refresh(emit = true): void {
    this.names = [...this.index.values()]
      .map(record => record.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    let stationCount = 0;
    let sx = 0;
    let sy = 0;
    let wells = 0;
    for (const record of this.index.values()) {
      stationCount += record.rows.length;
      sx += (record.xMin + record.xMax) / 2;
      sy += (record.yMin + record.yMax) / 2;
      wells++;
      record.cache = null;
    }
    this.stationCount = stationCount;
    this.origin = wells ? { x: sx / wells, y: sy / wells } : { x: 0, y: 0 };
    if (emit) this.emit();
  }

  replace(stations: SurveyInputStation[], fileName?: string, dropped = 0): ReplaceResult {
    const built = this.buildIndex(stations, dropped);
    this.index = built.index;
    this.importReport = built.report;
    this.lastImport = fileName || 'unknown';
    this.meta = { project: '', crs: '' };
    this.refresh();
    return { wells: this.index.size, stations: this.stationCount };
  }

  append(stations: SurveyInputStation[], fileName: string | undefined, mode: AppendMode, dropped = 0): AppendResult {
    const built = this.buildIndex(stations, dropped);
    this.importReport = built.report;
    let added = 0;
    let replaced = 0;
    let skipped = 0;
    let renamed = 0;
    let newStations = 0;

    for (const [key, incoming] of built.index) {
      if (!this.index.has(key)) {
        this.index.set(key, incoming);
        added++;
        newStations += incoming.rows.length;
        continue;
      }
      if (mode === 'skip') {
        skipped++;
        continue;
      }
      if (mode === 'replace') {
        this.index.set(key, incoming);
        replaced++;
        newStations += incoming.rows.length;
        continue;
      }
      let i = 2;
      let name: string;
      do {
        name = `${incoming.name} (${i})`;
        i++;
      } while (this.index.has(name.toLowerCase()));
      incoming.name = name;
      for (const station of incoming.rows) station.Well = name;
      this.index.set(name.toLowerCase(), incoming);
      renamed++;
      newStations += incoming.rows.length;
    }

    this.lastImport = fileName || 'unknown';
    this.refresh();
    return { added, replaced, skipped, renamed, newStations };
  }

  clear(): void {
    this.index = new Map();
    this.lastImport = '—';
    this.importReport = null;
    this.meta = { project: '', crs: '' };
    this.refresh();
  }

  setMeta(project: string, crs: string): DatabaseMeta {
    this.meta = { project: String(project || '').trim(), crs: String(crs || '').trim() };
    this.emit();
    return this.meta;
  }

  deleteWell(name: string): boolean {
    const record = this.get(name);
    if (!record) return false;
    this.index.delete(record.name.toLowerCase());
    this.refresh();
    return true;
  }

  updateWell(oldName: string, newName: string, editedRows: EditableSurveyRow[]): WellRecord {
    const oldRecord = this.get(oldName);
    if (!oldRecord) throw new AppError(`Well "${oldName}" is no longer in the database.`);
    const trimmed = String(newName || '').trim();
    if (!trimmed) throw new AppError('Well name cannot be blank.');
    const oldKey = oldRecord.name.toLowerCase();
    const newKey = trimmed.toLowerCase();
    if (newKey !== oldKey && this.index.has(newKey)) throw new AppError(`A well named "${trimmed}" already exists.`);
    if (!Array.isArray(editedRows) || !editedRows.length) throw new AppError('A well must contain at least one survey station.');

    const rows: SurveyInputStation[] = editedRows.map((row, i) => ({
      Well: trimmed,
      MD: normalizeNumeric(row.MD, `Row ${i + 1} MD`, false) as number,
      X: normalizeNumeric(row.X, `Row ${i + 1} X`, false) as number,
      Y: normalizeNumeric(row.Y, `Row ${i + 1} Y`, false) as number,
      Z: normalizeNumeric(row.Z, `Row ${i + 1} Z`, false) as number,
      TVD: normalizeNumeric(row.TVD, `Row ${i + 1} TVD`, false) as number,
      Azimuth: normalizeNumeric(row.Azimuth, `Row ${i + 1} Azimuth`, true),
      Inclination: normalizeNumeric(row.Inclination, `Row ${i + 1} Inclination`, true),
      SURV_Type: row.SURV_Type,
      BHT: row.BHT,
      NOTES: row.NOTES,
    }));

    rows.sort((a, b) => a.MD - b.MD);
    for (let i = 1; i < rows.length; i++) {
      if (Math.abs(rows[i].MD - rows[i - 1].MD) < 1e-9) {
        throw new AppError('Duplicate MD values are not allowed when editing a well.');
      }
    }

    const ignoredReport = emptyReport();
    const record = this.finalizeRecord(trimmed, rows, ignoredReport);
    this.index.delete(oldKey);
    this.index.set(newKey, record);
    this.refresh();
    return record;
  }

  get(name: string | null | undefined): WellRecord | null {
    return name == null ? null : this.index.get(String(name).trim().toLowerCase()) || null;
  }

  require(name: string): WellRecord {
    const record = this.get(name);
    if (!record) throw new AppError(`Well "${name || ''}" is not in the database.`);
    return record;
  }

  duplicatesOf(stations: SurveyInputStation[]): string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const station of stations) {
      const key = station.Well.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = this.index.get(key);
      if (existing) duplicates.push(existing.name);
    }
    return duplicates;
  }

  toRows(): Array<Record<string, string | number>> {
    return this.names.flatMap(name => this.wellRows(name));
  }

  wellRows(name: string): Array<Record<string, string | number>> {
    return this.require(name).rows.map(surveyTemplateRow);
  }

  stats(): DatabaseStats {
    let maxMD = 0;
    let longest = '—';
    let stations = 0;
    for (const record of this.index.values()) {
      stations += record.rows.length;
      if (record.mdMax > maxMD) {
        maxMD = record.mdMax;
        longest = record.name;
      }
    }
    return { wells: this.index.size, stations, maxMD, longest, lastImport: this.lastImport };
  }

  buffers(record: WellRecord): RenderBuffers {
    if (record.cache) return record.cache;
    const n = record.rows.length;
    const cache: RenderBuffers = {
      n,
      x: new Float64Array(n),
      y: new Float64Array(n),
      z: new Float64Array(n),
      md: new Float64Array(n),
      tvd: new Float64Array(n),
      inc: new Float64Array(n),
      azi: new Float64Array(n),
      dls: new Float64Array(n),
      dlsMax: 0,
      dlsAvg: 0,
    };
    let dlsSum = 0;
    let dlsN = 0;
    for (let i = 0; i < n; i++) {
      const station = record.rows[i];
      cache.x[i] = station.X - this.origin.x;
      cache.y[i] = station.Y - this.origin.y;
      cache.z[i] = station.Z;
      cache.md[i] = station.MD;
      cache.tvd[i] = station.TVD;
      cache.inc[i] = station.Inclination;
      cache.azi[i] = station.Azimuth;
      if (i > 0) {
        const dls = dlsPer30(record.rows[i - 1], station);
        cache.dls[i] = dls;
        if (dls > cache.dlsMax) cache.dlsMax = dls;
        dlsSum += dls;
        dlsN++;
      }
    }
    cache.dlsAvg = dlsN ? dlsSum / dlsN : 0;
    record.cache = cache;
    return cache;
  }

  allRecords(): WellRecord[] {
    return this.names.map(name => this.require(name));
  }
}

export function qualityText(report: ImportReport | null): string {
  if (!report) return '';
  const bits: string[] = [];
  if (report.derived) bits.push(`${report.derived} station(s) with derived inclination/azimuth`);
  if (report.duplicates) bits.push(`${report.duplicates} duplicated depth(s) removed`);
  if (report.conflicts) {
    bits.push(`${report.conflicts} conflicting duplicate depth(s) kept first${
      report.conflictExamples.length ? ` (${report.conflictExamples.join(', ')})` : ''
    }`);
  }
  if (report.geometryWarnings) bits.push(`${report.geometryWarnings} course(s) flagged by geometry QC`);
  if (report.dropped) bits.push(`${report.dropped} incomplete row(s) ignored`);
  return bits.join(' · ');
}
