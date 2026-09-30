import { describe, expect, it } from 'vitest';
import {
  closestPair3D,
  closestPointToWell3D,
  dlsPer30,
  latLonToUtm,
  mcmDelta,
  mcmPartial,
  pairAtElevation,
  solveMDSolutions,
  stationAtMD,
  utmToLatLon,
} from '../engine';
import { demoA, demoAmbiguous, demoB } from './fixtures';

describe('WTM 4.3 numerical parity benchmarks', () => {
  it('matches minimum-curvature delta benchmark', () => {
    const r = mcmDelta(100, 20, 350, 220, 55, 25);
    expect(r.dTVD).toBeCloseTo(94.62867168383083, 10);
    expect(r.dN).toBeCloseTo(67.48694709805608, 10);
    expect(r.dE).toBeCloseTo(17.934193866165245, 10);
  });

  it('matches exact partial minimum-curvature benchmark', () => {
    const r = mcmPartial(100, 20, 350, 220, 55, 25, 160);
    expect(r.dTVD).toBeCloseTo(52.86190812210147, 10);
    expect(r.dN).toBeCloseTo(27.59792936619017, 10);
    expect(r.dE).toBeCloseTo(2.8215527502447415, 10);
    expect(r.Inclination).toBeCloseTo(36.42469309735567, 10);
    expect(r.Azimuth).toBeCloseTo(14.88200512742344, 10);
  });

  it('matches interpolated station benchmark', () => {
    const r = stationAtMD(demoA, 175);
    expect(r.X).toBeCloseTo(500040.12261905783, 8);
    expect(r.Y).toBeCloseTo(9200027.561134199, 8);
    expect(r.Z).toBeCloseTo(1334.389908024126, 8);
    expect(r.TVD).toBeCloseTo(165.6100919758739, 8);
    expect(r.Azimuth).toBeCloseTo(71.68579300826758, 9);
    expect(r.Inclination).toBeCloseTo(31.595397252527732, 9);
  });

  it('matches DLS benchmark', () => {
    expect(dlsPer30(demoA.rows[1], demoA.rows[2])).toBeCloseTo(6.462656138707566, 11);
  });

  it('preserves multiple TVD solutions', () => {
    const roots = solveMDSolutions(demoAmbiguous, 'mTVD', 50);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(52.62326888278359, 8);
    expect(roots[1]).toBeCloseTo(265.3986686265853, 8);
  });

  it('matches point-to-well 3D benchmark', () => {
    const hit = closestPointToWell3D(demoA, { X: 500050, Y: 9200020, Z: 1400 });
    expect(hit.distance).toBeCloseTo(36.07373978320975, 8);
    expect(hit.point.MD).toBeCloseTo(114.77793573782527, 7);
  });

  it('matches well-to-well closest approach benchmark', () => {
    const hit = closestPair3D(demoA, demoB);
    expect(hit.distance).toBeCloseTo(10.158905133826751, 8);
    expect(hit.a.MD).toBeCloseTo(175.8861473694053, 7);
    expect(hit.b.MD).toBeCloseTo(152.80595509137572, 7);
  });

  it('matches 2D same-elevation distance benchmark', () => {
    const hit = pairAtElevation(demoA, demoB, 1350);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(20.303884894460907, 8);
    expect(hit!.a.MD).toBeCloseTo(156.97275349528354, 7);
    expect(hit!.b.MD).toBeCloseTo(135.33228884198252, 7);
  });

  it('matches WGS84 lat/lon -> UTM benchmark and round-trip', () => {
    const utm = latLonToUtm(-6.2, 106.8);
    expect(utm.zone).toBe(48);
    expect(utm.hemisphere).toBe('S');
    expect(utm.easting).toBeCloseTo(699163.3905617252, 6);
    expect(utm.northing).toBeCloseTo(9314348.961580029, 6);

    const ll = utmToLatLon(utm.easting, utm.northing, utm.zone, utm.hemisphere);
    expect(ll.latitude).toBeCloseTo(-6.199999999865063, 10);
    expect(ll.longitude).toBeCloseTo(106.79999999999589, 10);
  });
});
