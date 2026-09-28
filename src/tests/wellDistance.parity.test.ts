import { describe, expect, it } from 'vitest';
import { WellDatabase } from '../data/database';
import {
  offsetSearch,
  pointRadiusSearch,
  pointSelectedProfiles,
  radiusSearch,
  sortPairRows,
  wellPairProfile,
} from '../services/wellDistance';
import { buildConsistentWell, demoA, demoB } from './fixtures';

function makeDatabase(): WellDatabase {
  const database = new WellDatabase();
  const demoC = buildConsistentWell('DEMO-03', 499930, 9199960, 1510, [
    { md: 0, inc: 0, azi: 0 },
    { md: 110, inc: 18, azi: 145 },
    { md: 240, inc: 38, azi: 160 },
    { md: 370, inc: 52, azi: 175 },
  ]);
  database.replace([...demoA.rows, ...demoB.rows, ...demoC], 'phase5-demo.csv');
  return database;
}

describe('WTM 4.3 Well Distance workflow parity', () => {
  it('preserves radius-search 2D and 3D result semantics', () => {
    const database = makeDatabase();
    const twoD = radiusSearch(database, {
      referenceWell: 'DEMO-01', referenceType: 'mMD', referenceValue: 175, radius: 200, mode: '2d',
    });
    expect(twoD.rows).toHaveLength(2);
    expect(twoD.rows[0].Well).toBe('DEMO-02');
    expect(twoD.rows[0]['Distance (meter)']).toBe(10.212);
    expect(twoD.rows[0].mMD).toBe(153.087);

    const threeD = radiusSearch(database, {
      referenceWell: 'DEMO-01', referenceType: 'mMD', referenceValue: 175, radius: 200, mode: '3d',
    });
    expect(threeD.rows).toHaveLength(2);
    expect(threeD.rows[0].Well).toBe('DEMO-02');
    expect(threeD.rows[0]['Distance (meter)']).toBe(10.187);
    expect(threeD.rows[0]['Radius ftMD']).toBe('0–1,157.4');
  });

  it('preserves the 1-ftMD pair profile, 2D blanks and exact 3D closest approach', () => {
    const database = makeDatabase();
    const twoD = wellPairProfile(database, { referenceWell: 'DEMO-01', offsetWell: 'DEMO-02', mode: '2d' });
    expect(twoD.rows).toHaveLength(1150);
    expect(twoD.unavailable).toBe(66);
    expect(twoD.rows[0]['Distance (meter)']).toBe('');
    expect(twoD.nearest?.distance).toBeCloseTo(10.208264523594075, 10);

    const threeD = wellPairProfile(database, { referenceWell: 'DEMO-01', offsetWell: 'DEMO-02', mode: '3d' });
    expect(threeD.rows).toHaveLength(1150);
    expect(threeD.unavailable).toBe(0);
    expect(threeD.closest?.distance).toBeCloseTo(10.158905133826751, 10);
    expect(threeD.closest?.a.MD).toBeCloseTo(175.8861473694053, 8);
    expect(threeD.closest?.b.MD).toBeCloseTo(152.80595509137572, 8);
  });

  it('preserves offset corridor intervals', () => {
    const database = makeDatabase();
    const result = offsetSearch(database, 'DEMO-01', 150);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      Rank: 1,
      Well: 'DEMO-02',
      'Minimum Distance (meter)': 10.159,
      'Radius mMD': '0–309.2',
      'Radius ftMD': '0–1,014.5',
    });
  });

  it('preserves point-radius and selected-well profile output', () => {
    const database = makeDatabase();
    const point = { X: 500040, Y: 9200028, Z: 1334.39 };
    const radius = pointRadiusSearch(database, { point, radius: 160, mode: '3d' });
    expect(radius.rows).toHaveLength(3);
    expect(radius.rows[0].Well).toBe('DEMO-01');
    expect(radius.rows[0]['Distance (meter)']).toBe(0.456);

    const profiles = pointSelectedProfiles(database, point, ['DEMO-01', 'DEMO-02']);
    expect(profiles.rows).toHaveLength(2398);
    expect(profiles.rows[0]['Distance (meter)']).toBe(172.658);
    expect(profiles.rows[profiles.rows.length - 1]['Distance (meter)']).toBe(226.482);
    expect(profiles.details[0].min?.distance).toBe(0.459);
  });

  it('keeps blank pair distances at the bottom when sorting closest-first', () => {
    const database = makeDatabase();
    const result = wellPairProfile(database, { referenceWell: 'DEMO-01', offsetWell: 'DEMO-02', mode: '2d' });
    const sorted = sortPairRows(result.rows, 'Distance (meter)', 'asc');
    expect(sorted[0]['Distance (meter)']).not.toBe('');
    expect(sorted[sorted.length - 1]['Distance (meter)']).toBe('');
  });
});
