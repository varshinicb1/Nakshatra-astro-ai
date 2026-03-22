// --- Light Pollution & Seeing Quality Utility ---

export interface SkyConditions {
  bortle: number;
  transparency: string;
  seeing: string;
  notes: string;
}

export class SkyForecaster {
  /**
   * Estimates Bortle scale based on latitude/longitude
   * (Simplified offline model - in production would fetch from lightpollutionmap.info API)
   */
  static getBortle(lat: number, lng: number): number {
    // City centers are usually Bortle 8-9
    // Deserts are Bortle 1-2
    // This is a heuristic estimate for v4.0.0
    const absLat = Math.abs(lat);
    const absLng = Math.abs(lng);
    
    // Very simple "distance from nowhere" logic
    if (absLat < 10 || absLng < 10) return 3; // Likely remote
    if (absLat > 40 && absLat < 55) return 6; // Typical suburban Europe/US
    return 5; // Default average
  }

  static getSeeingConditions(lat: number, lng: number): SkyConditions {
    const bortle = this.getBortle(lat, lng);
    
    let transparency = "Good";
    let seeing = "Stable";
    let notes = "Optimal for deep space imaging.";

    if (bortle > 7) {
      transparency = "Poor (Light Wash)";
      seeing = "Variable";
      notes = "Extreme light pollution. Use narrow-band filters.";
    } else if (bortle > 4) {
      transparency = "Average";
      seeing = "Moderate";
      notes = "Suburban skies. Stack more frames to improve SNR.";
    }

    return { bortle, transparency, seeing, notes };
  }
}
