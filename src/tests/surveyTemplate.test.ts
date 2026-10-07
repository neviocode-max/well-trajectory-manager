import { describe, expect, it } from 'vitest';
import { WellDatabase } from '../data/database';
import { normalizeFullTrajectory, parseDirectionalSurvey } from '../data/normalization';
import { SURVEY_TEMPLATE_KEYS } from '../data/surveyTemplate';
import { FT } from '../engine/constants';
import { reconstructDirectionalSurvey } from '../engine/directionalSurvey';
import { parseDelimited, toCSV } from '../services/delimited';
import { parseTrajectoryFile } from '../services/importExport';
import { calculateConverterRow, converterInputRows, roundedConversion } from '../services/trajectoryTools';

const sample = [
  ['MBA-1', '0', '0', '0', '0', '90', '', '', '791062', '9206713', '0', '6415.715', 'RKB'],
  ['MBA-1', '31.20079', '9.51', '0', '0', '90', '', '', '791062', '9206713', '31.20079', '6384.514', ''],
];
const text = (separator = ',') => [SURVEY_TEMPLATE_KEYS, ...sample].map(row => row.join(separator)).join('\n');

describe('default survey template', () => {
  it.each([',', '\t', ';'])('imports the supplied template with delimiter %j', async separator => {
    const result = await parseTrajectoryFile(new File([text(separator)], 'survey.csv'));
    expect(result.parsed.kind).toBe('full');
    if (result.parsed.kind !== 'full') throw new Error('Expected full trajectory');
    expect(result.parsed.dropped).toBe(0);
    expect(result.parsed.stations).toHaveLength(2);
    expect(result.parsed.stations[0].NOTES).toBe('RKB');
    expect(result.parsed.stations[1]).toMatchObject({ Well: 'MBA-1', MD: 9.51, X: 791062, Y: 9206713, Inclination: 0, Azimuth: 0, SURV_Type: '', BHT: '', NOTES: '' });
    expect(result.parsed.stations[1].TVD).toBeCloseTo(31.20079 / FT, 10);
    expect(result.parsed.stations[1].Z).toBeCloseTo(6384.514 / FT, 10);
  });

  it('exports every column in the supplied order and round-trips geometry without rounding', () => {
    const input = normalizeFullTrajectory(parseDelimited(text()));
    const db = new WellDatabase();
    db.replace(input.stations, 'survey.csv');
    const csv = toCSV(db.toRows(), SURVEY_TEMPLATE_KEYS);
    expect(csv.split('\n')[0]).toBe(SURVEY_TEMPLATE_KEYS.join(','));
    expect(Object.keys(db.wellRows('MBA-1')[0])).toEqual(SURVEY_TEMPLATE_KEYS);
    expect(db.toRows()[0].NOTES).toBe('RKB');
    expect(db.toRows()[1]).toMatchObject({ DEPTH_m: 9.51, DIP: 90, SURV_Type: '', BHT: '', NOTES: '' });
    const restored = normalizeFullTrajectory(parseDelimited(csv));
    expect(restored.stations.map(row => row.NOTES)).toEqual(['RKB', '']);
    for (let i = 0; i < input.stations.length; i++) {
      for (const key of ['MD', 'X', 'Y', 'Z', 'TVD'] as const) {
        expect(restored.stations[i][key]).toBeCloseTo(input.stations[i][key], 10);
      }
    }
  });

  it('preserves quoted metadata through append, rename, and a well edit', () => {
    const raw = parseDelimited(text());
    raw[0].SURV_Type = 'Gyro, final';
    raw[0].BHT = '215.0';
    raw[0].NOTES = 'RKB, \"reference\"\nFinal survey';
    const stations = normalizeFullTrajectory(raw).stations;
    const db = new WellDatabase();
    db.replace(stations, 'survey.csv');
    db.append(stations, 'copy.csv', 'rename');
    const record = db.require('MBA-1 (2)');
    db.updateWell(record.name, 'Renamed', record.rows);
    const csv = toCSV(db.wellRows('Renamed'), SURVEY_TEMPLATE_KEYS);
    const restored = normalizeFullTrajectory(parseDelimited(csv));
    expect(restored.stations[0]).toMatchObject({ Well: 'Renamed', SURV_Type: 'Gyro, final', BHT: '215.0', NOTES: raw[0].NOTES });
    expect(restored.stations[1]).toMatchObject({ SURV_Type: '', BHT: '', NOTES: '' });
  });

  it('accepts earlier files without a NOTES column and exports blank notes', () => {
    const raw = parseDelimited(text());
    for (const row of raw) delete row.NOTES;
    const db = new WellDatabase();
    db.replace(normalizeFullTrajectory(raw).stations, 'older-survey.csv');
    expect(db.toRows().map(row => row.NOTES)).toEqual(['', '']);
  });

  it('accepts feet-only MD, DIP-only inclination, and mixed-case headers', () => {
    const raw = parseDelimited(text());
    raw[1].DEPTH_m = '';
    raw[1].DEV_ANGLE = '';
    raw[1].DIP = '65';
    const mixedCase = raw.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value])));
    const result = normalizeFullTrajectory(mixedCase);
    expect(result.stations[1].MD).toBeCloseTo(31.20079 / FT, 10);
    expect(result.stations[1].Inclination).toBe(25);
    expect(result.stations[0].NOTES).toBe('RKB');
  });

  it('rejects contradictory or invalid DIP values', () => {
    const raw = parseDelimited(text());
    raw[0].DIP = '80';
    expect(() => normalizeFullTrajectory(raw)).toThrow('DIP = 90');
    raw[0].DIP = '91';
    expect(() => normalizeFullTrajectory(raw)).toThrow('DIP must be between');
  });

  it('supports directional template imports and retains metadata during reconstruction', () => {
    const raw = parseDelimited('WELL_NAME,DEPTH_ft,AZIMUTH,DIP,SURV_Type,BHT,NOTES\nDEMO,0,0,90,Gyro,210,RKB\nDEMO,100,45,70,MWD,220,Survey station');
    const parsed = parseDirectionalSurvey(raw)!;
    expect(parsed.groups[0].rows[1].MD).toBeCloseTo(100 / FT, 10);
    const rows = reconstructDirectionalSurvey(parsed.groups[0].rows, { well: 'DEMO', MD: 0, X: 1, Y: 2, Z: 1000, TVD: 0 });
    expect(rows[1]).toMatchObject({ Inclination: 20, SURV_Type: 'MWD', BHT: '220', NOTES: 'Survey station' });
  });

  it('accepts the same template in the converter and calculates DIP at interpolated depths', () => {
    const raw = parseDelimited(text());
    const inputs = converterInputRows(raw);
    expect(inputs.type).toBe('mMD');
    expect(inputs.rows[1]).toEqual({ well: 'MBA-1', input: '9.51' });
    const db = new WellDatabase();
    db.replace(normalizeFullTrajectory(raw).stations, 'survey.csv');
    const converted = calculateConverterRow(db.get('MBA-1'), 'MBA-1', inputs.type, '5');
    expect(converted.error).toBe('');
    expect(converted.output!.DIP).toBe(90);
    expect(roundedConversion(converted.output!).DIP).toBe(90);
    raw[1].DEPTH_m = '';
    expect(Number(converterInputRows(raw).rows[1].input)).toBeCloseTo(31.20079 / FT, 10);
  });

  it('keeps existing converter depth-column imports available', () => {
    expect(converterInputRows(parseDelimited('Well,ftTVD\nDEMO,100'))).toEqual({ type: 'ftTVD', rows: [{ well: 'DEMO', input: '100' }] });
  });
});
