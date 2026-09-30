import { describe, expect, it } from 'vitest';
import { WellDatabase } from '../data/database';
import { convertRecord, type TrajectoryInputType } from '../engine/trajectory';
import { closestPair3D } from '../engine/distance';
import { measureStations } from '../services/studio';
import { offsetSearch, pointRadiusSearch, wellPairProfile } from '../services/wellDistance';
import { demoA, demoB } from './fixtures';

function makeDatabase(): WellDatabase {
  const database = new WellDatabase();
  database.replace([...demoA.rows, ...demoB.rows], 'production-regression.csv');
  return database;
}

describe('WTM 1.0 production regression guard', () => {
  it('starts with an empty in-memory database', () => {
    const database = new WellDatabase();
    expect(database.stats()).toMatchObject({ wells: 0, stations: 0, longest: '—', lastImport: '—' });
    expect(database.names).toEqual([]);
  });

  it('round-trips all six trajectory reference types to the same physical point', () => {
    const point = convertRecord(demoA, 'mMD', 175);
    const inputs: Array<[TrajectoryInputType, number]> = [
      ['mMD', point.mMD],
      ['ftMD', point.ftMD],
      ['mTVD', point.mTVD],
      ['ftTVD', point.ftTVD],
      ['mASL', point.mASL],
      ['ftASL', point.ftASL],
    ];
    for (const [type, value] of inputs) {
      const result = convertRecord(demoA, type, value);
      expect(result.mMD).toBeCloseTo(175, 6);
      expect(result.X).toBeCloseTo(point.X, 5);
      expect(result.Y).toBeCloseTo(point.Y, 5);
      expect(result.mASL).toBeCloseTo(point.mASL, 5);
    }
  });

  it('keeps the exact closest-approach engine independent of the 1-ft profile sampling', () => {
    const database = makeDatabase();
    const exact = closestPair3D(database.require('DEMO-01'), database.require('DEMO-02'));
    const profile = wellPairProfile(database, { referenceWell: 'DEMO-01', offsetWell: 'DEMO-02', mode: '3d' });
    expect(profile.closest?.distance).toBeCloseTo(exact.distance, 10);
    expect(profile.closest?.a.MD).toBeCloseTo(exact.a.MD, 8);
    expect(profile.closest?.b.MD).toBeCloseTo(exact.b.MD, 8);
  });

  it('keeps point, corridor and Studio measurement workflows on the same coordinate convention', () => {
    const database = makeDatabase();
    const reference = database.require('DEMO-01');
    const station = reference.rows[2];
    const pointResult = pointRadiusSearch(database, { point: { X: station.X, Y: station.Y, Z: station.Z }, radius: 500, mode: '3d' });
    expect(pointResult.rows[0].Well).toBe('DEMO-01');
    expect(pointResult.rows[0]['Distance (meter)']).toBe(0);

    const corridor = offsetSearch(database, 'DEMO-01', 100);
    expect(corridor.rows.some(row => row.Well === 'DEMO-02')).toBe(true);

    const measurement = measureStations(reference.rows[1], database.require('DEMO-02').rows[1]);
    expect(measurement.d3).toBeGreaterThanOrEqual(measurement.horiz);
    expect(measurement.vert).toBe(Math.abs(reference.rows[1].Z - database.require('DEMO-02').rows[1].Z));
  });

  it('supports edit/rename and clear without leaving stale database state', () => {
    const database = makeDatabase();
    const record = database.require('DEMO-01');
    database.updateWell('DEMO-01', 'DEMO-01-EDIT', record.rows.map(row => ({
      MD: String(row.MD), X: String(row.X), Y: String(row.Y), Z: String(row.Z), TVD: String(row.TVD),
      Azimuth: String(row.Azimuth), Inclination: String(row.Inclination),
    })));
    expect(database.get('DEMO-01')).toBeNull();
    expect(database.require('DEMO-01-EDIT').rows).toHaveLength(record.rows.length);
    database.clear();
    expect(database.stats().wells).toBe(0);
    expect(database.stats().stations).toBe(0);
    expect(database.importReport).toBeNull();
    expect(database.meta).toEqual({ project: '', crs: '' });
  });
});
