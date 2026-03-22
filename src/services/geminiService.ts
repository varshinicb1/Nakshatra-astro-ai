import { apiClient } from './apiClient';

export interface AnalysisResult {
  constellations: string[];
  objects: Array<{
    name: string;
    type: string;
    magnitude: string;
    spectral_type?: string;
    atmospheric_data?: string;
    catalog_id?: string;
    distance?: string;
    ra?: string;
    dec?: string;
  }>;
  analysis: string;
  research_data: {
    right_ascension: string;
    declination: string;
    visibility_score: number;
    bortle_class?: number;
    seeing_arcsec?: string;
    transparency?: string;
  };
  imaging_tips?: {
    recommended_iso: string;
    recommended_exposure: string;
    recommended_focal_length: string;
    notes: string;
  };
  upcoming_events?: Array<{
    event: string;
    date: string;
    details: string;
  }>;
  error?: string;
}

const EMPTY_RESULT: AnalysisResult = {
  constellations: [],
  objects: [],
  analysis: 'Unable to analyze image.',
  research_data: { right_ascension: 'N/A', declination: 'N/A', visibility_score: 0 },
};

export async function identifyCelestialObjects(
  base64Image: string,
  location: { lat: number; lng: number },
  orientation: { alpha: number; beta: number; gamma: number },
  identifiedConstellations: string[] = [] // Truth-layer from local Plate Solver
): Promise<AnalysisResult> {
  // Input validation
  if (!base64Image || base64Image.length < 100) {
    return { ...EMPTY_RESULT, error: 'Invalid image data. Please capture again.' };
  }

  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return { ...EMPTY_RESULT, error: 'Location data unavailable. Please enable GPS.' };
  }

  try {
    const result = await apiClient.analyzeImage(base64Image, location, orientation, identifiedConstellations);

    // Validate response structure
    if (!result || typeof result !== 'object') {
      return { ...EMPTY_RESULT, error: 'Invalid response from server.' };
    }

    return {
      constellations: Array.isArray(result.constellations) ? result.constellations : [],
      objects: Array.isArray(result.objects) ? result.objects : [],
      analysis: result.analysis || 'Analysis not available.',
      research_data: {
        right_ascension: result.research_data?.right_ascension || 'N/A',
        declination: result.research_data?.declination || 'N/A',
        visibility_score: typeof result.research_data?.visibility_score === 'number'
          ? result.research_data.visibility_score : 0,
        bortle_class: result.research_data?.bortle_class,
        seeing_arcsec: result.research_data?.seeing_arcsec,
        transparency: result.research_data?.transparency,
      },
      imaging_tips: result.imaging_tips || undefined,
      upcoming_events: Array.isArray(result.upcoming_events) ? result.upcoming_events : undefined,
    };
  } catch (err: any) {
    console.error('Analysis Error:', err);
    return {
      ...EMPTY_RESULT,
      error: err.message || 'Analysis failed. Check connection and try again.',
    };
  }
}
