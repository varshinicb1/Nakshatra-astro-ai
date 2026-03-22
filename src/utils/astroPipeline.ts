/**
 * astroPipeline.ts
 * 
 * Professional Signal-Extraction Engine for Astrophotography.
 * Handles massive frame calibration, hardware pre-rejection matching,
 * and high-end mathematical stretching natively.
 */

export interface GyroSample {
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

export interface AccelSample {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export const AstroPipeline = {
  /**
   * Hardware Pre-Rejection: Compute Gyro Stability
   * Samples orientation angular velocity over time. 
   * A score < 0.95 means the phone is swaying during exposure.
   */
  computeStabilityScore: (samples: GyroSample[]): number => {
    if (samples.length < 2) return 1.0;
    
    let varianceSum = 0;
    for (let i = 1; i < samples.length; i++) {
      const p = samples[i - 1];
      const c = samples[i];
      const dt = (c.timestamp - p.timestamp) / 1000; // seconds
      if (dt <= 0) continue;
      
      const vAlpha = (c.alpha - p.alpha) / dt;
      const vBeta = (c.beta - p.beta) / dt;
      const vGamma = (c.gamma - p.gamma) / dt;
      
      varianceSum += Math.abs(vAlpha) + Math.abs(vBeta) + Math.abs(vGamma);
    }
    
    const avgJitter = varianceSum / samples.length;
    // Perfect stability = 1.0, high jitter drops towards 0.0
    return Math.max(0, 1.0 - (avgJitter * 0.05));
  },

  /**
   * Hardware Pre-Rejection: Compute Motion Variance
   * Analyzes accelerometer raw data. Used to reject frames with sudden translation.
   */
  computeMotionVariance: (samples: AccelSample[]): number => {
    if (samples.length < 2) return 0;
    
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const s of samples) { sumX += s.x; sumY += s.y; sumZ += s.z; }
    
    const meanX = sumX / samples.length;
    const meanY = sumY / samples.length;
    const meanZ = sumZ / samples.length;
    
    let varX = 0, varY = 0, varZ = 0;
    for (const s of samples) {
      varX += Math.pow(s.x - meanX, 2);
      varY += Math.pow(s.y - meanY, 2);
      varZ += Math.pow(s.z - meanZ, 2);
    }
    
    return (varX + varY + varZ) / samples.length;
  },

  /**
   * Calibration Framework: Flat / Dark / Bias Pixel Math
   * Calibrated = (Raw - Dark - Bias) / (Flat - Bias)
   */
  applyCalibration: (
    rawFrame: Uint8ClampedArray,
    darkFrame: Uint8ClampedArray | null,
    flatFrame: Uint8ClampedArray | null,
    biasFrame: Uint8ClampedArray | null,
    width: number,
    height: number
  ): Uint8ClampedArray => {
    const calibrated = new Uint8ClampedArray(rawFrame.length);
    const len = width * height * 4;
    
    for (let i = 0; i < len; i += 4) {
      for (let c = 0; c < 3; c++) {
        const _raw = rawFrame[i + c];
        const _dark = darkFrame ? darkFrame[i + c] : 0;
        const _bias = biasFrame ? biasFrame[i + c] : 0;
        const _flat = flatFrame ? Math.max(1, flatFrame[i + c]) : 255;
        
        let val = (_raw - _dark - _bias);
        if (flatFrame) {
           val = (val / (_flat - _bias)) * 255;
        }
        
        calibrated[i + c] = Math.max(0, Math.min(255, val));
      }
      calibrated[i + 3] = 255; // Alpha
    }
    return calibrated;
  },

  /**
   * Post-Processing: Logarithmic Scaling
   * Brings out faint nebula dust by wrapping pixel data in a log curve: c * log(1 + pixel)
   */
  applyLogarithmicScaling: (imageData: ImageData): ImageData => {
    const data = imageData.data;
    const len = data.length;
    const c = 255 / Math.log(256); // Scaling constant for 8-bit

    for (let i = 0; i < len; i += 4) {
      data[i] = c * Math.log(1 + data[i]);
      data[i + 1] = c * Math.log(1 + data[i + 1]);
      data[i + 2] = c * Math.log(1 + data[i + 2]);
    }
    return imageData;
  },

  /**
   * Post-Processing: Histogram Equalization
   * Spreads the intensity values to utilize the full contrast ratio of the screen.
   */
  applyHistogramEqualization: (imageData: ImageData): ImageData => {
    const data = imageData.data;
    const len = data.length;
    const hist = new Array(256).fill(0);
    const pixelCount = len / 4;

    // Build intensity histogram (Grayscale approx)
    for (let i = 0; i < len; i += 4) {
      const v = Math.max(0, Math.min(255, Math.round(data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114)));
      hist[v]++;
    }

    // Cumulative Distribution Function (CDF)
    const cdf = new Array(256).fill(0);
    cdf[0] = hist[0];
    let cdfMin = cdf[0] > 0 ? cdf[0] : 0;
    
    for (let i = 1; i < 256; i++) {
        cdf[i] = cdf[i-1] + hist[i];
        if (cdfMin === 0 && cdf[i] > 0) cdfMin = cdf[i];
    }

    // Map new values based on CDF
    const map = new Array(256);
    for (let i = 0; i < 256; i++) {
        map[i] = Math.round(((cdf[i] - cdfMin) / (pixelCount - cdfMin)) * 255);
    }

    const result = new ImageData(new Uint8ClampedArray(data), imageData.width, imageData.height);
    for (let i = 0; i < len; i += 4) {
      result.data[i] = map[data[i]];
      result.data[i+1] = map[data[i+1]];
      result.data[i+2] = map[data[i+2]];
    }
    return result;
  },

  /**
   * Subpixel Earth Rotation Drift computation
   * Approximates drift across pixels per second based on FOV and focal length
   */
  computeEarthRotationDrift: (fovX: number, imageWidth: number, exposureTimeSec: number): number => {
    // Earth rotates at 15 arcseconds per second
    const earthRotationArcSecPerSec = 15;
    // Find pixel width in arcseconds
    const pixelArcSec = (fovX * 3600) / imageWidth;
    // Drift in pixels
    const driftPixels = (earthRotationArcSecPerSec * exposureTimeSec) / pixelArcSec;
    return driftPixels;
  }
};
