import { SURVEY_TEMPLATE_KEYS } from '../data/surveyTemplate';
import { describe, expect, it } from 'vitest';
import { WellDatabase } from '../data/database';
import { normalizeFullTrajectory, parseDirectionalSurvey } from '../data/normalization';
import { parseDelimited, toCSV } from '../services/delimited';
import { reconstructDirectionalSurvey } from '../engine/directionalSurvey';

const FULL_TEXT = `Well\tMD\tX\tY\tZ\tTVD\tAzimuth\tInclination\nDEMO-01\t0\t500000\t9200000\t1500\t0\t0\t0\nDEMO-01\t100\t500010\t9200002\t1400.5\t99.5\t45\t8\nDEMO-01\t100\t500011\t9200002\t1400.5\t99.5\t45\t8\nDEMO-02\t0\t500100\t9200100\t1490\t0\t\t\nDEMO-02\t120\t500110\t9200110\t1371\t119\t\t\n\t200\t1\t2\t3\t4\t0\t0`;

describe('WTM 4.3 database/import parity behavior', () => {
  it('parses TSV with the same delimited parser behavior', () => {
    const rows = parseDelimited(FULL_TEXT);
    expect(rows).toHaveLength(6);
    expect(rows[0].Well).toBe('DEMO-01');
    expect(rows[0].MD).toBe('0');
  });

  it('normalizes, de-duplicates, reports conflict and derives missing angles', () => {
    const raw = parseDelimited(FULL_TEXT);
    const normalized = normalizeFullTrajectory(raw);
    expect(normalized.dropped).toBe(1);
    expect(normalized.stations).toHaveLength(5);

    const db = new WellDatabase();
    const result = db.replace(normalized.stations, 'demo.tsv', normalized.dropped);
    expect(result.wells).toBe(2);
    expect(result.stations).toBe(4);
    expect(db.importReport?.duplicates).toBe(1);
    expect(db.importReport?.conflicts).toBe(1);
    expect(db.importReport?.derived).toBe(2);
    expect(db.importReport?.qcIssues.some(issue => issue.Type === 'Conflicting duplicate MD')).toBe(true);
    expect(db.require('DEMO-02').rows.every(row => Number.isFinite(row.Azimuth) && Number.isFinite(row.Inclination))).toBe(true);
  });

  it('preserves first-row precedence for conflicting duplicate MD', () => {
    const normalized = normalizeFullTrajectory(parseDelimited(FULL_TEXT));
    const db = new WellDatabase();
    db.replace(normalized.stations, 'demo.tsv', normalized.dropped);
    const station = db.require('DEMO-01').rows.find(row => row.MD === 100)!;
    expect(station.X).toBe(500010);
  });

  it('supports append skip / replace / rename semantics', () => {
    const db = new WellDatabase();
    const first = normalizeFullTrajectory(parseDelimited('Well,MD,X,Y,Z,TVD,Azimuth,Inclination\nDEMO-01,0,0,0,1000,0,0,0'));
    db.replace(first.stations, 'first.csv', first.dropped);

    const second = normalizeFullTrajectory(parseDelimited('Well,MD,X,Y,Z,TVD,Azimuth,Inclination\nDEMO-01,0,10,0,1000,0,0,0\nDEMO-03,0,20,0,1000,0,0,0'));
    const skipped = db.append(second.stations, 'second.csv', 'skip', second.dropped);
    expect(skipped.added).toBe(1);
    expect(skipped.skipped).toBe(1);
    expect(db.require('DEMO-01').rows[0].X).toBe(0);

    const renamed = db.append(second.stations, 'second.csv', 'rename', second.dropped);
    expect(renamed.renamed).toBe(2);
    expect(db.get('DEMO-01 (2)')).not.toBeNull();
    expect(db.get('DEMO-03 (2)')).not.toBeNull();

    const replaced = db.append(second.stations, 'second.csv', 'replace', second.dropped);
    expect(replaced.replaced).toBe(2);
    expect(db.require('DEMO-01').rows[0].X).toBe(10);
  });

  it('groups a multi-well MD/AZI/INC file and reconstructs from tie-in', () => {
    const raw = parseDelimited(`Well,MD,AZI,INC\nDEMO-01,0,0,0\nDEMO-01,100,45,15\nDEMO-02,0,180,0\nDEMO-02,100,200,20`);
    const parsed = parseDirectionalSurvey(raw)!;
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.totalStations).toBe(4);

    const rebuilt = reconstructDirectionalSurvey(parsed.groups[0].rows, {
      well: 'DEMO-01', MD: 0, X: 500000, Y: 9200000, Z: 1500, TVD: 0,
    });
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt[1].MD).toBe(100);
    expect(Number.isFinite(rebuilt[1].X)).toBe(true);
  });

  it('exports standard master columns in stable order', () => {
    const normalized = normalizeFullTrajectory(parseDelimited('Well,MD,X,Y,Z,TVD,Azimuth,Inclination\nDEMO-01,0,1,2,3,4,5,6'));
    const db = new WellDatabase();
    db.replace(normalized.stations, 'demo.csv', normalized.dropped);
    const csv = toCSV(db.toRows(), SURVEY_TEMPLATE_KEYS);
    expect(csv.split('\n')[0]).toBe(SURVEY_TEMPLATE_KEYS.join(','));
    expect(db.toRows()[0]).toMatchObject({ WELL_NAME: 'DEMO-01', DEPTH_m: 0, UTM_E: 1, UTM_N: 2, DEV_ANGLE: 6, AZIMUTH: 5, DIP: 84 });
  });
});
