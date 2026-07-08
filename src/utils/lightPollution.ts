// --- Light Pollution & Seeing Quality Utility ---

export interface SkyConditions {
  bortle: number;
  transparency: string;
  seeing: string;
  notes: string;
}

export class SkyForecaster {
  /**
   * Estimates Bortle scale from an actual camera-measured sky background brightness,
   * rather than guessing from latitude/longitude. This mirrors how a Sky Quality Meter (SQM)
   * works: a darker measured background (lower mean pixel level, normalized for exposure/ISO)
   * corresponds to a lower (better) Bortle class; a brighter background (light-polluted skyglow)
   * corresponds to a higher (worse) Bortle class.
   *
   * @param meanBackgroundLevel Mean 0-255 brightness of a star-free sky region in a raw camera frame.
   * @param exposureMs Exposure time used to capture the sample frame (longer exposure gathers more
   *                   ambient skyglow, so brightness must be normalized against it).
   * @param iso ISO/gain used for the sample frame (higher ISO amplifies skyglow linearly).
   */
  static estimateBortleFromSkyBrightness(meanBackgroundLevel: number, exposureMs: number, iso: number): number {
    // Normalize to a reference exposure (1000ms @ ISO 800) so brightness is comparable
    // across different capture settings.
    const referenceExposure = 1000;
    const referenceIso = 800;
    const gainFactor = (exposureMs / referenceExposure) * (iso / referenceIso);
    const normalizedLevel = gainFactor > 0 ? meanBackgroundLevel / gainFactor : meanBackgroundLevel;

    // Empirical mapping: pristine dark sites produce a near-black background at these settings
    // (mean level ~2-6), while heavily light-polluted urban skies wash the background out
    // towards mid-gray (~60+). Table interpolates the standard Bortle 1-9 scale between these.
    const thresholds = [3, 6, 10, 15, 22, 30, 40, 55];
    let bortle = 9;
    for (let i = 0; i < thresholds.length; i++) {
      if (normalizedLevel <= thresholds[i]) { bortle = i + 1; break; }
    }
    return bortle;
  }

  /**
   * Coarse fallback when no camera sample is available yet (e.g. before the video stream
   * has started). Only used transiently — replaced by the real camera-measured estimate
   * as soon as a frame can be sampled.
   */
  static getFallbackBortle(): number {
    return 5; // "average suburban" as a neutral placeholder until a real measurement lands
  }

  static getSeeingConditions(bortle: number): SkyConditions {
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
