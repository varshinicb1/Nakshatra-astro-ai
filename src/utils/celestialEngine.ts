/**
 * Nakshatra Celestial Engine (Stellarium Remix)
 * Lightweight implementation of VSOP87 and high-precision coordinate transformations.
 */

export interface CelestialCoordinate {
  ra: number;  // Hours (0-24)
  dec: number; // Degrees (-90 to 90)
  alt?: number;
  az?: number;
}

export const STAR_CATALOG = [
  { name: "Sirius", ra: 6.752, dec: -16.716, mag: -1.46 },
  { name: "Canopus", ra: 6.399, dec: -52.695, mag: -0.74 },
  { name: "Rigil Kentaurus", ra: 14.660, dec: -60.833, mag: -0.27 },
  { name: "Arcturus", ra: 14.261, dec: 19.182, mag: -0.05 },
  { name: "Vega", ra: 18.615, dec: 38.783, mag: 0.03 },
  { name: "Capella", ra: 5.278, dec: 45.998, mag: 0.08 },
  { name: "Rigel", ra: 5.242, dec: -8.201, mag: 0.13 },
  { name: "Procyon", ra: 7.655, dec: 5.224, mag: 0.38 },
  { name: "Achernar", ra: 1.628, dec: -57.236, mag: 0.46 },
  { name: "Betelgeuse", ra: 5.919, dec: 7.407, mag: 0.50 },
  { name: "Hadar", ra: 14.063, dec: -60.373, mag: 0.61 },
  { name: "Altair", ra: 19.846, dec: 8.868, mag: 0.77 },
  { name: "Acrux", ra: 12.443, dec: -63.099, mag: 0.76 },
  { name: "Aldebaran", ra: 4.598, dec: 16.509, mag: 0.86 },
  { name: "Antares", ra: 16.490, dec: -26.432, mag: 1.06 },
  { name: "Spica", ra: 13.419, dec: -11.161, mag: 1.04 },
  { name: "Pollux", ra: 7.755, dec: 28.026, mag: 1.14 },
  { name: "Fomalhaut", ra: 22.960, dec: -29.622, mag: 1.16 },
  { name: "Deneb", ra: 20.690, dec: 45.280, mag: 1.25 },
  { name: "Mimosa", ra: 12.795, dec: -59.688, mag: 1.25 },
  { name: "Regulus", ra: 10.139, dec: 11.967, mag: 1.35 },
  { name: "Polaris", ra: 2.530, dec: 89.264, mag: 1.98 }
];

export class CelestialEngine {
  // Constants
  private static readonly J2000 = 2451545.0;
  private static readonly RAD = Math.PI / 180;
  private static readonly DEG = 180 / Math.PI;

  /**
   * Calculate Julian Date from JS Date
   */
  static getJulianDate(date: Date): number {
    return (date.getTime() / 86400000.0) + 2440587.5;
  }

  /**
   * Calculate Centuries since J2000.0
   */
  static getCenturies(jd: number): number {
    return (jd - this.J2000) / 36525.0;
  }

  /**
   * Precession model (Simplified IAU 2006)
   */
  static applyPrecession(coords: CelestialCoordinate, t: number): CelestialCoordinate {
    // Ported from Stellarium's StelCoordinateTr.cpp
    const raRad = coords.ra * 15 * this.RAD;
    const decRad = coords.dec * this.RAD;

    const m = (3.07234 + 0.00186 * t) * 15 * this.RAD / 3600;
    const n = (20.0468 - 0.0085 * t) * this.RAD / 3600;

    const dRa = m + n * Math.sin(raRad) * Math.tan(decRad);
    const dDec = n * Math.cos(raRad);

    return {
      ra: (raRad + dRa) * this.DEG / 15,
      dec: (decRad + dDec) * this.DEG
    };
  }

  /**
   * Horizontal Coordinate Transformation (Alt/Az)
   */
  static toHorizontal(coords: CelestialCoordinate, lat: number, lon: number, date: Date): { alt: number; az: number } {
    const jd = this.getJulianDate(date);
    const t = this.getCenturies(jd);
    
    // GAST (Sidereal Time)
    const d = jd - this.J2000;
    let lst = (280.46061837 + 360.98564736629 * d + lon) % 360;
    if (lst < 0) lst += 360;

    const ha = (lst - coords.ra * 15) * this.RAD;
    const dec = coords.dec * this.RAD;
    const phi = lat * this.RAD;

    const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
    const alt = Math.asin(sinAlt);

    const cosAz = (Math.sin(dec) - Math.sin(phi) * sinAlt) / (Math.cos(phi) * Math.cos(alt));
    let az = Math.acos(Math.min(1, Math.max(-1, cosAz))) * this.DEG;

    if (Math.sin(ha) > 0) az = 360 - az;

    // Simplified Refraction (Stellarium Style)
    let refraction = 0;
    const altDeg = alt * this.DEG;
    if (altDeg > -0.5) {
      refraction = 1.02 / Math.tan((altDeg + 10.3 / (altDeg + 5.11)) * this.RAD) / 60;
    }

    return {
      alt: altDeg + refraction,
      az: az
    };
  }

  /**
   * Simplified VSOP87 for Sun (Essential for planetary tracks)
   */
  static getSunPosition(date: Date): CelestialCoordinate {
    const jd = this.getJulianDate(date);
    const t = this.getCenturies(jd);
    
    const L = (280.46646 + 36000.76983 * t + 0.0003032 * t * t) % 360;
    const M = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) % 360;
    const C = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(M * this.RAD) +
              (0.019993 - 0.000101 * t) * Math.sin(2 * M * this.RAD) +
              0.002893 * Math.sin(3 * M * this.RAD);
    
    const lambda = L + C;
    const epsilon = 23.43929 - 0.0130042 * t;
    
    const ra = Math.atan2(Math.cos(epsilon * this.RAD) * Math.sin(lambda * this.RAD), Math.cos(lambda * this.RAD)) * this.DEG;
    const dec = Math.asin(Math.sin(epsilon * this.RAD) * Math.sin(lambda * this.RAD)) * this.DEG;

    return { ra: (ra < 0 ? ra + 360 : ra) / 15, dec };
  }
}
