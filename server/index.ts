import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: '../.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// Trust first proxy (fixes rate-limiting behind Nginx/ALB/Cloudflare)
app.set('trust proxy', 1);

// --- Security Middleware ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.googleapis.com", "https://api.nasa.gov"],
      connectSrc: ["'self'", "https://*.googleapis.com", "api.open-meteo.com", "api.open-notify.org"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// Request Logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.ip}`);
  next();
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'capacitor://localhost', 'https://localhost', 'http://*.local'],
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Token'],
}));

app.use(express.json({ limit: '20mb' }));

// Rate limiting: 30 requests per minute per IP
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// App token validation (prevents random API abuse)
const DEFAULT_TOKEN = 'nakshatra-secure-token-2026';
const APP_TOKEN = process.env.APP_SECRET_TOKEN || DEFAULT_TOKEN;
if (APP_TOKEN === DEFAULT_TOKEN) {
  console.warn('⚠️  WARNING: Using default app token. Set APP_SECRET_TOKEN in .env.local for production!');
}

function validateAppToken(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = req.headers['x-app-token'];
  if (token !== APP_TOKEN) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// --- Health Check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: '3.0.0' });
});

// --- Weather / Astronomy Conditions (free Open-Meteo API) ---
app.get('/api/weather', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      res.status(400).json({ error: 'lat and lng are required' });
      return;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,cloud_cover,visibility,wind_speed_10m&timezone=auto`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.current) {
      res.status(502).json({ error: 'Weather data unavailable' });
      return;
    }

    const current = data.current;
    // Calculate astronomy seeing score (0-100)
    const cloudPenalty = current.cloud_cover * 0.6;
    const humidityPenalty = Math.max(0, (current.relative_humidity_2m - 40)) * 0.3;
    const windPenalty = Math.min(20, current.wind_speed_10m * 0.8);
    const seeingScore = Math.max(0, Math.round(100 - cloudPenalty - humidityPenalty - windPenalty));

    res.json({
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      cloudCover: current.cloud_cover,
      visibility: current.visibility,
      windSpeed: current.wind_speed_10m,
      seeingScore,
      seeingLabel: seeingScore >= 80 ? 'Excellent' : seeingScore >= 60 ? 'Good' : seeingScore >= 40 ? 'Fair' : 'Poor',
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Weather API error:', err);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// --- ISS Tracker (free API) ---
app.get('/api/iss', async (_req, res) => {
  try {
    const response = await fetch('http://api.open-notify.org/iss-now.json');
    const data = await response.json();
    res.json({
      latitude: parseFloat(data.iss_position.latitude),
      longitude: parseFloat(data.iss_position.longitude),
      timestamp: data.timestamp,
    });
  } catch (err) {
    console.error('ISS API error:', err);
    res.status(500).json({ error: 'Failed to fetch ISS position' });
  }
});

// --- Gemini AI Analysis (secured behind app token + rate limit) ---
app.post('/api/analyze', validateAppToken, aiLimiter, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(500).json({ error: 'API key not configured on server.' });
    return;
  }

  const { image, location, orientation } = req.body;

  // Input validation
  if (!image || typeof image !== 'string') {
    res.status(400).json({ error: 'Invalid image data' });
    return;
  }
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    res.status(400).json({ error: 'Invalid location data' });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are an expert astrophysicist and celestial observer with PhD-level knowledge.
Analyze this night sky photograph with extreme precision.

Location: Lat ${location.lat.toFixed(6)}, Lng ${location.lng.toFixed(6)}
Device Orientation: Azimuth ${orientation?.alpha?.toFixed(1) || 0}°, Altitude ${orientation?.beta?.toFixed(1) || 0}°, Roll ${orientation?.gamma?.toFixed(1) || 0}°
Timestamp: ${new Date().toISOString()}

Perform the following analysis:
1. Identify ALL visible constellations with confidence levels.
2. Identify ALL visible stars, planets, nebulae, galaxies, and deep-sky objects.
3. For each star: provide spectral classification (e.g., O5V, G2V, M4III), apparent magnitude, absolute magnitude if notable, and distance in light-years.
4. For each planet: provide current phase, angular diameter, surface features visible, and atmospheric composition notes.
5. For nebulae/galaxies: provide Messier/NGC catalog number, type classification, angular size, and distance.
6. Assess image quality: light pollution level (Bortle scale 1-9), atmospheric seeing (arcseconds), transparency rating.
7. Calculate precise sky coordinates (RA/Dec in J2000 epoch) for the center of the field of view.
8. Suggest optimal imaging parameters (ISO, exposure time, focal length) for this specific sky region.
9. Note any upcoming celestial events visible from this location in the next 7 days.
10. Provide a detailed scientific narrative about the most prominent objects visible.

Return ONLY valid JSON in this exact format:
{
  "constellations": ["Name1", "Name2"],
  "objects": [
    {
      "name": "Object Name",
      "type": "Star|Planet|Nebula|Galaxy|Cluster|Comet",
      "magnitude": "apparent mag value",
      "spectral_type": "spectral class (stars only)",
      "atmospheric_data": "atmospheric info (planets only)",
      "catalog_id": "Messier/NGC/IC number if applicable",
      "distance": "distance with units",
      "ra": "RA in HH:MM:SS format",
      "dec": "Dec in DD:MM:SS format"
    }
  ],
  "analysis": "Detailed scientific analysis text (2-3 paragraphs)",
  "research_data": {
    "right_ascension": "center FOV RA",
    "declination": "center FOV Dec",
    "visibility_score": 0-100,
    "bortle_class": 1-9,
    "seeing_arcsec": "seeing in arcseconds",
    "transparency": "Excellent|Good|Fair|Poor"
  },
  "imaging_tips": {
    "recommended_iso": "ISO value",
    "recommended_exposure": "exposure in seconds",
    "recommended_focal_length": "focal length in mm",
    "notes": "additional imaging advice"
  },
  "upcoming_events": [
    {
      "event": "event description",
      "date": "date string",
      "details": "brief details"
    }
  ]
}`;

  // Retry with exponential backoff
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const imageData = image.includes(',') ? image.split(',')[1] : image;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-05-20',
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageData,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from AI');

      const parsed = JSON.parse(text);

      // Validate response structure
      if (!parsed.constellations || !Array.isArray(parsed.constellations)) {
        parsed.constellations = [];
      }
      if (!parsed.objects || !Array.isArray(parsed.objects)) {
        parsed.objects = [];
      }
      if (!parsed.analysis) {
        parsed.analysis = 'Analysis could not be completed.';
      }
      if (!parsed.research_data) {
        parsed.research_data = { right_ascension: 'N/A', declination: 'N/A', visibility_score: 0 };
      }

      res.json(parsed);
      return;
    } catch (err: any) {
      lastError = err;
      console.error(`Analysis attempt ${attempt + 1} failed:`, err.message);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  console.error('All analysis attempts failed:', lastError);
  res.status(500).json({
    error: 'Analysis failed after retries. Please try again.',
    constellations: [],
    objects: [],
    analysis: 'Unable to analyze image.',
    research_data: { right_ascension: 'N/A', declination: 'N/A', visibility_score: 0 },
  });
});

// --- Astronomy Picture of the Day (NASA APOD - free, with cache) ---
let apodCache: { data: any; fetchedAt: number } | null = null;
const APOD_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const APOD_FALLBACK = {
  title: 'The Milky Way Over Monument Valley',
  explanation: 'APOD data is temporarily unavailable. Please try again later.',
  url: 'https://apod.nasa.gov/apod/image/2301/MilkyWayMonumentValley_Welling_960.jpg',
  media_type: 'image',
  date: new Date().toISOString().slice(0, 10),
};

app.get('/api/apod', async (_req, res) => {
  // Serve from cache if fresh
  if (apodCache && Date.now() - apodCache.fetchedAt < APOD_CACHE_TTL) {
    res.json(apodCache.data);
    return;
  }
  try {
    const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';
    const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${apiKey}`);
    if (!response.ok) {
      console.warn(`APOD API returned ${response.status}, serving fallback.`);
      res.json(apodCache?.data || APOD_FALLBACK);
      return;
    }
    const data = await response.json();
    apodCache = { data, fetchedAt: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('APOD API error:', err);
    res.json(apodCache?.data || APOD_FALLBACK);
  }
});

app.listen(PORT, () => {
  console.log(`\n🔭 Nakshatra Astro-AI Server v3.0.0`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     POST /api/analyze    - AI celestial analysis (secured)`);
  console.log(`     GET  /api/weather    - Weather & seeing conditions`);
  console.log(`     GET  /api/iss        - ISS live position`);
  console.log(`     GET  /api/apod       - NASA Picture of the Day`);
  console.log(`     GET  /api/health     - Server health check\n`);
});
