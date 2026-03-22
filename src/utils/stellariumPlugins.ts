/**
 * Stellarium Plugin Suite — Ported to TypeScript
 * Adapted from Stellarium (GPLv2) - https://github.com/Stellarium/stellarium
 * Original authors: Marcos Cardinot (MeteorShowers), Ivan Marti-Vidal (Observability),
 *                   Timothy Reaves (Oculars/CCD)
 */

import { CelestialEngine } from './celestialEngine';

// ============================================================
// METEOR SHOWERS PLUGIN (from plugins/MeteorShowers)
// ============================================================

export interface MeteorShowerData {
  name: string;
  designation: string;
  raPeak: number;       // RA of radiant at peak (degrees)
  decPeak: number;      // Dec of radiant at peak (degrees)
  solarLonPeak: number; // Solar longitude at peak (degrees)
  solarLonStart: number;
  solarLonEnd: number;
  speed: number;        // km/s
  zhrMax: number;       // Zenithal Hourly Rate at maximum
  parentBody: string;
  b1: number;           // slope before peak
  b2: number;           // slope after peak
}

// Catalog ported from Stellarium's showers.json
const METEOR_SHOWER_CATALOG: MeteorShowerData[] = [
  { name: 'Quadrantids',       designation: 'QUA', raPeak: 230, decPeak: 49,   solarLonPeak: 283.16, solarLonStart: 275, solarLonEnd: 290, speed: 41, zhrMax: 120, parentBody: '2003 EH1',        b1: 5.0,  b2: 14.0 },
  { name: 'Lyrids',            designation: 'LYR', raPeak: 271, decPeak: 34,   solarLonPeak: 32.32,  solarLonStart: 28,  solarLonEnd: 37,  speed: 49, zhrMax: 18,  parentBody: 'C/1861 G1',       b1: 1.3,  b2: 3.0  },
  { name: 'Eta Aquariids',     designation: 'ETA', raPeak: 338, decPeak: -1,   solarLonPeak: 45.50,  solarLonStart: 35,  solarLonEnd: 60,  speed: 66, zhrMax: 50,  parentBody: '1P/Halley',       b1: 0.5,  b2: 0.8  },
  { name: 'Perseids',          designation: 'PER', raPeak: 48,  decPeak: 58,   solarLonPeak: 140.0,  solarLonStart: 120, solarLonEnd: 150, speed: 59, zhrMax: 100, parentBody: '109P/Swift-Tuttle', b1: 2.1, b2: 5.0  },
  { name: 'Orionids',          designation: 'ORI', raPeak: 95,  decPeak: 16,   solarLonPeak: 208.0,  solarLonStart: 195, solarLonEnd: 220, speed: 66, zhrMax: 20,  parentBody: '1P/Halley',       b1: 0.7,  b2: 1.0  },
  { name: 'Leonids',           designation: 'LEO', raPeak: 152, decPeak: 22,   solarLonPeak: 235.27, solarLonStart: 231, solarLonEnd: 238, speed: 71, zhrMax: 15,  parentBody: '55P/Tempel-Tuttle', b1: 4.0, b2: 10.0 },
  { name: 'Geminids',          designation: 'GEM', raPeak: 112, decPeak: 33,   solarLonPeak: 262.2,  solarLonStart: 253, solarLonEnd: 270, speed: 35, zhrMax: 150, parentBody: '3200 Phaethon',   b1: 2.6,  b2: 8.0  },
  { name: 'Ursids',            designation: 'URS', raPeak: 217, decPeak: 76,   solarLonPeak: 270.7,  solarLonStart: 267, solarLonEnd: 274, speed: 33, zhrMax: 10,  parentBody: '8P/Tuttle',       b1: 3.0,  b2: 6.0  },
  { name: 'Southern Delta Aquariids', designation: 'SDA', raPeak: 340, decPeak: -16, solarLonPeak: 125.0, solarLonStart: 115, solarLonEnd: 140, speed: 41, zhrMax: 16, parentBody: '96P/Machholz', b1: 0.5, b2: 0.7 },
  { name: 'Taurids',           designation: 'TAU', raPeak: 52,  decPeak: 14,   solarLonPeak: 220.0,  solarLonStart: 180, solarLonEnd: 260, speed: 27, zhrMax: 5,   parentBody: '2P/Encke',        b1: 0.1,  b2: 0.1  },
];

export class MeteorShowerEngine {
  /**
   * Calculate the Sun's ecliptic longitude for a given date
   * Ported from Stellarium's MeteorShower::JDfromSolarLongitude logic
   */
  static getSolarLongitude(date: Date): number {
    const jd = CelestialEngine.getJulianDate(date);
    const t = CelestialEngine.getCenturies(jd);
    const L0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
    const M = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
    const RAD = Math.PI / 180;
    const C = (1.9146 - 0.004817 * t) * Math.sin(M * RAD)
            + (0.019993 - 0.000101 * t) * Math.sin(2 * M * RAD)
            + 0.00029 * Math.sin(3 * M * RAD);
    return ((L0 + C) % 360 + 360) % 360;
  }

  /**
   * Calculate current ZHR using Gaussian distribution model
   * Ported from Stellarium's MeteorShower::calculateZHR
   */
  static calculateZHR(shower: MeteorShowerData, solarLon: number): number {
    let dist = solarLon - shower.solarLonPeak;
    if (dist > 180) dist -= 360;
    if (dist < -180) dist += 360;

    const b = dist < 0 ? shower.b1 : shower.b2;
    return shower.zhrMax * Math.pow(10, -b * Math.abs(dist));
  }

  /**
   * Get all currently active meteor showers with their ZHR
   */
  static getActiveShowers(date: Date): Array<MeteorShowerData & { currentZHR: number; status: string }> {
    const solarLon = this.getSolarLongitude(date);
    return METEOR_SHOWER_CATALOG
      .map(shower => {
        const zhr = this.calculateZHR(shower, solarLon);
        let inRange = false;
        let start = shower.solarLonStart;
        let end = shower.solarLonEnd;

        if (start > end) { // Wraps around 360
          inRange = solarLon >= start || solarLon <= end;
        } else {
          inRange = solarLon >= start && solarLon <= end;
        }

        return {
          ...shower,
          currentZHR: Math.round(zhr * 10) / 10,
          status: inRange ? (zhr > shower.zhrMax * 0.5 ? 'PEAK' : 'ACTIVE') : 'INACTIVE'
        };
      })
      .filter(s => s.status !== 'INACTIVE')
      .sort((a, b) => b.currentZHR - a.currentZHR);
  }
}

// ============================================================
// OBSERVABILITY PLUGIN (from plugins/Observability)
// ============================================================

export class ObservabilityEngine {
  private static readonly RAD = Math.PI / 180;
  private static readonly DEG = 180 / Math.PI;

  /**
   * Calculate Hour Angle for rise/set
   * Ported from Observability::calculateHourAngle
   */
  static calculateHourAngle(latRad: number, elevationRad: number, decRad: number): number | null {
    const cosH = (Math.sin(elevationRad) - Math.sin(latRad) * Math.sin(decRad))
               / (Math.cos(latRad) * Math.cos(decRad));
    if (cosH > 1 || cosH < -1) return null; // circumpolar or never rises
    return Math.acos(cosH);
  }

  /**
   * Calculate rise, transit, set times for a celestial object
   * Ported from Observability::calculateSolarSystemEvents
   */
  static getRiseTransitSet(ra: number, dec: number, lat: number, lon: number, date: Date): {
    rise: Date | null; transit: Date; set: Date | null; isCircumpolar: boolean; neverRises: boolean;
  } {
    const jd = CelestialEngine.getJulianDate(date);
    const d = jd - 2451545.0;
    let lst0 = (280.46061837 + 360.98564736629 * d + lon) % 360;
    if (lst0 < 0) lst0 += 360;

    // Transit
    let transitLST = ra * 15; // RA in hours to degrees
    let transitHA = transitLST - lst0;
    if (transitHA < 0) transitHA += 360;
    const transitHours = transitHA / 15.041; // Sidereal to solar
    const transitTime = new Date(date);
    transitTime.setHours(0, 0, 0, 0);
    transitTime.setMinutes(transitHours * 60);

    // Rise/Set
    const horizonAlt = -0.5667 * this.RAD; // Standard refraction
    const H = this.calculateHourAngle(lat * this.RAD, horizonAlt, dec * this.RAD);

    if (H === null) {
      const isAbove = Math.sin(dec * this.RAD) * Math.sin(lat * this.RAD) > 0;
      return { rise: null, transit: transitTime, set: null, isCircumpolar: isAbove, neverRises: !isAbove };
    }

    const Hdeg = H * this.DEG;
    const riseHours = transitHours - (Hdeg / 15.041);
    const setHours = transitHours + (Hdeg / 15.041);

    const riseTime = new Date(date);
    riseTime.setHours(0, 0, 0, 0);
    riseTime.setMinutes(((riseHours % 24) + 24) % 24 * 60);

    const setTime = new Date(date);
    setTime.setHours(0, 0, 0, 0);
    setTime.setMinutes(((setHours % 24) + 24) % 24 * 60);

    return { rise: riseTime, transit: transitTime, set: setTime, isCircumpolar: false, neverRises: false };
  }

  /**
   * Get tonight's best observing window
   */
  static getBestObservingWindow(lat: number, lon: number, date: Date): {
    astronomicalTwilightStart: Date; astronomicalTwilightEnd: Date; darkHours: number;
  } {
    const sunPos = CelestialEngine.getSunPosition(date);
    const sunRTS = this.getRiseTransitSet(sunPos.ra, sunPos.dec, lat, lon, date);

    // Astronomical twilight: Sun at -18 degrees
    const twilightH = this.calculateHourAngle(lat * this.RAD, -18 * this.RAD, sunPos.dec * this.RAD);

    const twilightStart = new Date(date);
    const twilightEnd = new Date(date);

    if (twilightH !== null && sunRTS.set) {
      const setMins = sunRTS.set.getHours() * 60 + sunRTS.set.getMinutes();
      const offset = (twilightH * this.DEG / 15.041) * 60;
      twilightStart.setHours(0, 0, 0, 0);
      twilightStart.setMinutes(setMins + offset);
      twilightEnd.setHours(0, 0, 0, 0);
      twilightEnd.setMinutes(setMins + 24 * 60 - 2 * offset); // Symmetric
    }

    const darkHours = twilightH ? (twilightH * 2 * this.DEG / 15) : 0;

    return { astronomicalTwilightStart: twilightStart, astronomicalTwilightEnd: twilightEnd, darkHours: Math.round(darkHours * 10) / 10 };
  }
}

// ============================================================
// OCULARS/CCD PLUGIN (from plugins/Oculars)
// ============================================================

export interface CCDSensor {
  name: string;
  resolutionX: number;
  resolutionY: number;
  chipWidth: number;    // mm
  chipHeight: number;   // mm
  pixelWidth: number;   // microns
  pixelHeight: number;  // microns
}

export class OcularsEngine {
  /**
   * Calculate actual FOV using Yerkes formula
   * Ported from CCD::getActualFOVx / getActualFOVy
   * fov_degrees = (chipDimension_mm / focalLength_mm) * (180/PI)
   */
  static getActualFOV(chipDimMm: number, focalLengthMm: number, barlow: number = 1): number {
    return (chipDimMm / (focalLengthMm * barlow)) * (180 / Math.PI);
  }

  /**
   * Calculate angular resolution (arcsec/pixel), a.k.a. plate scale
   * Ported from CCD::getCentralAngularResolutionX
   */
  static getPlateScale(pixelSizeMicrons: number, focalLengthMm: number): number {
    return (pixelSizeMicrons / (focalLengthMm * 1000)) * 206265; // arcsec/pixel
  }

  /**
   * Mobile phone camera FOV estimation
   * Uses typical phone sensor specs
   */
  static getPhoneCameraFOV(sensorWidthMm: number = 5.76, focalLengthMm: number = 4.25): {
    fovX: number; fovY: number; fovDiagonal: number;
  } {
    const fovX = this.getActualFOV(sensorWidthMm, focalLengthMm);
    const fovY = this.getActualFOV(sensorWidthMm * 0.75, focalLengthMm); // 4:3 aspect
    const fovDiagonal = Math.sqrt(fovX * fovX + fovY * fovY);
    return {
      fovX: Math.round(fovX * 100) / 100,
      fovY: Math.round(fovY * 100) / 100,
      fovDiagonal: Math.round(fovDiagonal * 100) / 100
    };
  }

  /**
   * Common phone camera sensors database
   */
  static readonly PHONE_SENSORS: CCDSensor[] = [
    { name: 'Samsung GN2 (Galaxy S21 Ultra)', resolutionX: 12000, resolutionY: 9000, chipWidth: 12.20, chipHeight: 9.15, pixelWidth: 1.22, pixelHeight: 1.22 },
    { name: 'Sony IMX766 (OnePlus/OPPO)',     resolutionX: 8160,  resolutionY: 6120, chipWidth: 8.60,  chipHeight: 6.45, pixelWidth: 1.0,  pixelHeight: 1.0 },
    { name: 'Generic Phone (Typical)',         resolutionX: 4000,  resolutionY: 3000, chipWidth: 5.76,  chipHeight: 4.29, pixelWidth: 1.4,  pixelHeight: 1.4 },
  ];
}
