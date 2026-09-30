import { describe, expect, it } from 'vitest';
import { WellDatabase } from '../data/database';
import {
  absoluteX,
  absoluteY,
  colorForWell,
  dlsFactor,
  dlsSeries,
  dlsUnitLabel,
  measureStations,
  norm360,
  stationDistance,
} from '../services/studio';
import { demoA, demoB } from './fixtures';
import type { SurveyStation } from '../types/survey';

function makeDatabase(): WellDatabase {
  const database = new WellDatabase();
  database.replace([...demoA.rows, ...demoB.rows], 'studio-demo.csv');
  return database;
}

describe('WTM 4.3 Trajectory Studio parity helpers', () => {
  it('preserves the original deterministic well-colour hashing', () => {
    expect(colorForWell('DEMO-01')).toBe('#84cc16');
    expect(colorForWell('DEMO-02')).toBe('#e879f9');
  });

  it('preserves DLS unit conversion and labels', () => {
    expect(dlsFactor('30m')).toBe(1);
    expect(dlsFactor('100ft')).toBeCloseTo(1.016, 12);
    expect(dlsUnitLabel('30m')).toBe('°/30m');
    expect(dlsUnitLabel('100ft')).toBe('°/100ft');
  });

  it('reconstructs absolute Easting/Northing from origin-relative render buffers', () => {
    const database = makeDatabase();
    const record = database.require('DEMO-01');
    const buffer = database.buffers(record);
    const x = absoluteX(buffer, database.origin.x);
    const y = absoluteY(buffer, database.origin.y);
    expect(Array.from(x)).toEqual(record.rows.map(row => row.X));
    expect(Array.from(y)).toEqual(record.rows.map(row => row.Y));
  });

  it('scales cached DLS series exactly like WTM 4.3 diagnostic mode', () => {
    const database = makeDatabase();
    const buffer = database.buffers(database.require('DEMO-01'));
    const per30 = dlsSeries(buffer, '30m');
    const per100ft = dlsSeries(buffer, '100ft');
    expect(per30).toHaveLength(buffer.n);
    for (let i = 0; i < buffer.n; i++) {
      expect(per30[i]).toBeCloseTo(buffer.dls[i], 12);
      expect(per100ft[i]).toBeCloseTo(buffer.dls[i] * 1.016, 12);
    }
  });

  it('preserves Studio measurement distance, vertical/horizontal split, bearing and ΔMD', () => {
    const a: SurveyStation = { Well: 'DEMO-01', MD: 100, X: 500000, Y: 9200000, Z: 1500, TVD: 100, Inclination: 0, Azimuth: 0 };
    const b: SurveyStation = { Well: 'DEMO-02', MD: 160, X: 500030, Y: 9200040, Z: 1488, TVD: 112, Inclination: 0, Azimuth: 0 };
    const measurement = measureStations(a, b);
    expect(measurement.horiz).toBe(50);
    expect(measurement.vert).toBe(12);
    expect(measurement.d3).toBeCloseTo(Math.sqrt(2644), 12);
    expect(measurement.bearing).toBeCloseTo(36.86989764584402, 12);
    expect(measurement.dMD).toBe(60);
    expect(stationDistance(a, b)).toBeCloseTo(measurement.d3, 12);
  });

  it('normalizes bearings to [0, 360)', () => {
    expect(norm360(-10)).toBe(350);
    expect(norm360(370)).toBe(10);
    expect(norm360(720)).toBe(0);
  });
});
