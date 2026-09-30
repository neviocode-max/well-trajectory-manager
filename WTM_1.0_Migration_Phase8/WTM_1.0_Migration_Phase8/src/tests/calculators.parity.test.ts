import { describe, expect, it } from 'vitest';
import { calculateConverterRow, roundedConversion, SplitAmbiguousError, splitTrajectory } from '../services/trajectoryTools';
import { demoA, demoAmbiguous } from './fixtures';

describe('WTM 4.3 calculator workflow parity', () => {
  it('converts an mMD input through the shared trajectory engine', () => {
    const result = calculateConverterRow(demoA, 'DEMO-01', 'mMD', '175');
    expect(result.error).toBe('');
    expect(result.output).not.toBeNull();
    expect(result.output!.mMD).toBeCloseTo(175, 12);
    expect(result.output!.ftMD).toBeCloseTo(574.1469816272966, 10);
    expect(result.output!.mTVD).toBeCloseTo(165.6100919758739, 10);
    expect(result.output!.mASL).toBeCloseTo(1334.389908024126, 10);
    expect(result.output!.X).toBeCloseTo(500040.12261905783, 8);
    expect(result.output!.Y).toBeCloseTo(9200027.561134199, 8);
    expect(result.output!.Azimuth).toBeCloseTo(71.68579300826758, 9);
    expect(result.output!.Inclination).toBeCloseTo(31.595397252527732, 9);
  });

  it('preserves WTM 4.3 converter validation order', () => {
    const missingInput = calculateConverterRow(null, 'NOT-A-WELL', 'mMD', '');
    expect(missingInput.error).toBe('Enter mMD.');
    const missingWell = calculateConverterRow(null, 'NOT-A-WELL', 'mMD', '10');
    expect(missingWell.error).toBe('Well "NOT-A-WELL" is not in the database.');
  });

  it('uses the same 3-decimal export rounding as WTM 4.3', () => {
    const result = calculateConverterRow(demoA, 'DEMO-01', 'mMD', '175');
    expect(roundedConversion(result.output!)).toEqual({
      Well: 'DEMO-01',
      mMD: 175,
      ftMD: 574.147,
      mTVD: 165.61,
      ftTVD: 543.34,
      mASL: 1334.39,
      ftASL: 4377.92,
      X: 500040.123,
      Y: 9200027.561,
      Azimuth: 71.686,
      Inclination: 31.595,
    });
  });

  it('splits regular mMD intervals and preserves survey/interpolated classification', () => {
    const result = splitTrajectory(demoA, {
      type: 'mMD', step: 50, from: 0, to: 350, includeSurvey: false,
    });
    expect(result.unresolved).toBe(0);
    expect(result.requestedTargets).toBe(8);
    expect(result.rows.map(row => row.mMD)).toEqual([0, 50, 100, 150, 200, 250, 300, 350]);
    expect(result.rows.map(row => row.Type)).toEqual([
      'Survey', 'Interpolated', 'Survey', 'Interpolated',
      'Interpolated', 'Interpolated', 'Interpolated', 'Survey',
    ]);
    expect(result.rows[3]).toMatchObject({
      mMD: 150,
      mTVD: 143.834,
      mASL: 1356.166,
      X: 500028.702,
      Y: 9200023.098,
      Azimuth: 65.189,
      Inclination: 27.251,
    });
  });

  it('folds original survey stations into a split when requested', () => {
    const result = splitTrajectory(demoA, {
      type: 'mMD', step: 50, from: 0, to: 350, includeSurvey: true,
    });
    expect(result.rows.map(row => row.mMD)).toEqual([0, 50, 100, 150, 200, 220, 250, 300, 350]);
    expect(result.rows.find(row => row.mMD === 220)?.Type).toBe('Survey');
  });

  it('stops TVD splitting when a requested depth maps to multiple MD branches', () => {
    expect(() => splitTrajectory(demoAmbiguous, {
      type: 'mTVD', step: 10, from: 50, to: 50, includeSurvey: false,
    })).toThrow(SplitAmbiguousError);
    try {
      splitTrajectory(demoAmbiguous, { type: 'mTVD', step: 10, from: 50, to: 50, includeSurvey: false });
    } catch (error) {
      expect(error).toBeInstanceOf(SplitAmbiguousError);
      const ambiguous = error as SplitAmbiguousError;
      expect(ambiguous.count).toBe(1);
      expect(ambiguous.value).toBe(50);
      expect(ambiguous.solutions).toHaveLength(2);
      expect(ambiguous.solutions[0]).toBeCloseTo(52.62326888278359, 8);
      expect(ambiguous.solutions[1]).toBeCloseTo(265.3986686265853, 8);
    }
  });
});
