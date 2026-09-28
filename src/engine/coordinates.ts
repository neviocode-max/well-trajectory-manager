import { D2R, R2D, clamp } from './constants';
import { AppError } from './errors';

const A = 6378137.0;
const ECC_SQ = 0.0066943799901413165;
const K0 = 0.9996;

export interface UtmCoordinate {
  latitude: number;
  longitude: number;
  zone: number;
  hemisphere: 'N' | 'S';
  easting: number;
  northing: number;
}

export function utmZoneFor(lat: number, lon: number): number {
  let zone = Math.floor((lon + 180) / 6) + 1;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if (lon >= 0 && lon < 9) zone = 31;
    else if (lon < 21) zone = 33;
    else if (lon < 33) zone = 35;
    else if (lon < 42) zone = 37;
  }
  return clamp(zone, 1, 60);
}

/** WGS84 latitude/longitude -> UTM, ported formula-for-formula from WTM 4.3. */
export function latLonToUtm(lat: number, lon: number): UtmCoordinate {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -80 || lat > 84 || lon < -180 || lon > 180) {
    throw new AppError('Latitude must be -80° to 84° and longitude -180° to 180° for UTM.');
  }
  const zone = utmZoneFor(lat, lon);
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  const latRad = lat * D2R;
  const lonRad = lon * D2R;
  const lonOriginRad = lonOrigin * D2R;
  const eccPrimeSq = ECC_SQ / (1 - ECC_SQ);
  const N = A / Math.sqrt(1 - ECC_SQ * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = eccPrimeSq * Math.cos(latRad) ** 2;
  const AA = Math.cos(latRad) * (lonRad - lonOriginRad);
  const M = A * (
    (1 - ECC_SQ / 4 - 3 * ECC_SQ ** 2 / 64 - 5 * ECC_SQ ** 3 / 256) * latRad
    - (3 * ECC_SQ / 8 + 3 * ECC_SQ ** 2 / 32 + 45 * ECC_SQ ** 3 / 1024) * Math.sin(2 * latRad)
    + (15 * ECC_SQ ** 2 / 256 + 45 * ECC_SQ ** 3 / 1024) * Math.sin(4 * latRad)
    - (35 * ECC_SQ ** 3 / 3072) * Math.sin(6 * latRad)
  );
  const easting = K0 * N * (
    AA + (1 - T + C) * AA ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSq) * AA ** 5 / 120
  ) + 500000;
  let northing = K0 * (
    M + N * Math.tan(latRad) * (
      AA ** 2 / 2
      + (5 - T + 9 * C + 4 * C * C) * AA ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSq) * AA ** 6 / 720
    )
  );
  const hemisphere: 'N' | 'S' = lat < 0 ? 'S' : 'N';
  if (lat < 0) northing += 10000000;
  return { latitude: lat, longitude: lon, zone, hemisphere, easting, northing };
}

/** UTM -> WGS84 latitude/longitude, ported formula-for-formula from WTM 4.3. */
export function utmToLatLon(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S'): UtmCoordinate {
  if (![easting, northing, zone].every(Number.isFinite) || zone < 1 || zone > 60) {
    throw new AppError('Enter valid UTM easting, northing and zone (1–60).');
  }
  if (easting < 100000 || easting > 1000000 || northing < 0 || northing > 10000000) {
    throw new AppError('UTM coordinates are outside the normal numeric range.');
  }

  const x = easting - 500000;
  let y = northing;
  if (hemisphere === 'S') y -= 10000000;
  const eccPrimeSq = ECC_SQ / (1 - ECC_SQ);
  const M = y / K0;
  const mu = M / (A * (1 - ECC_SQ / 4 - 3 * ECC_SQ ** 2 / 64 - 5 * ECC_SQ ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - ECC_SQ)) / (1 + Math.sqrt(1 - ECC_SQ));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = A / Math.sqrt(1 - ECC_SQ * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = eccPrimeSq * Math.cos(phi1) ** 2;
  const R1 = A * (1 - ECC_SQ) / Math.pow(1 - ECC_SQ * Math.sin(phi1) ** 2, 1.5);
  const D = x / (N1 * K0);
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
    D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * eccPrimeSq) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * eccPrimeSq - 3 * C1 * C1) * D ** 6 / 720
  );
  const lon = (
    D
    - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * eccPrimeSq + 24 * T1 * T1) * D ** 5 / 120
  ) / Math.cos(phi1);
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  return {
    latitude: lat * R2D,
    longitude: lonOrigin + lon * R2D,
    zone,
    hemisphere,
    easting,
    northing,
  };
}
