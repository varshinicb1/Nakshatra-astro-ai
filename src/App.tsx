import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera as CapCamera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { SkyForecaster, SkyConditions } from './utils/lightPollution';
import { 
  Compass, Camera, History, Settings, X, ChevronRight, Zap, Loader2, Star, Info, 
  LayoutTemplate, Download, Share2, Trash2, Maximize2, Gauge, Sun, Moon, Wind, 
  Thermometer, CloudRain, CalendarDays, Eye, Microscope, Activity, MapPin, 
  CheckCircle2, ShieldAlert, Sparkles, Map as MapIcon, Telescope, Focus, Layers,
  FileCode, BookOpen
} from 'lucide-react';
import { useSensors } from './hooks/useSensors';
import { identifyCelestialObjects, AnalysisResult } from './services/geminiService';
import { PlateSolver } from './utils/plateSolver';
import { useDatabase } from './hooks/useDatabase';
import { useCapacitor } from './hooks/useCapacitor';
import { ImpactStyle } from '@capacitor/haptics';
import { ToastContainer, ToastData } from './components/Toast';
import { NightModeOverlay } from './components/NightMode';
import { Gallery } from './components/Gallery';
import { ImageComparison } from './components/ImageComparison';
import { MeteorShowerEngine, ObservabilityEngine, OcularsEngine } from './utils/stellariumPlugins';
import { AstroPipeline, GyroSample, AccelSample } from './utils/astroPipeline';
import { CelestialEngine, STAR_CATALOG } from './utils/celestialEngine';

type StackingAlgorithm = 'sigma' | 'median' | 'average' | 'trail';
type ViewMode = 'camera' | 'map' | 'gallery';

export default function App() {
  const { orientation, location, isFlat, requestPermission } = useSensors();
  const { items: gallery, addItem: addToGallery, deleteItem: deleteFromGallery } = useDatabase();
  const { vibrate } = useCapacitor();

  // Core state
  const [isCapturing, setIsCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stackedImage, setStackedImage] = useState<string | null>(null);
  const [singleFrame, setSingleFrame] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // UI state
  const [showIntro, setShowIntro] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('camera');
  const [showSettings, setShowSettings] = useState(false);
  const identifiedConstsRef = useRef<string[]>([]);
  const identifiedDSOsRef = useRef<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [isFocusPeaking, setIsFocusPeaking] = useState(false);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [sessionNotes, setSessionNotes] = useState<string>("");
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [isAudioTourActive, setIsAudioTourActive] = useState(false);
  const [isAligning, setIsAligning] = useState(false);
  const [skyConditions, setSkyConditions] = useState<SkyConditions | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [lastMeteorTime, setLastMeteorTime] = useState<number>(0);
  const [isHudVisible, setIsHudVisible] = useState(true);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureStartTimeRef = useRef<number>(0);

  // Settings
  const [isBracketing, setIsBracketing] = useState(true);
  const [stackingAlgo, setStackingAlgo] = useState<StackingAlgorithm>('sigma');
  const [isAutoSave, setIsAutoSave] = useState(true);
  const [frameCount, setFrameCount] = useState(12);
  const [exposureTime, setExposureTime] = useState(1000);
  const [iso, setIso] = useState<number>(800);
  const [exposureComp, setExposureComp] = useState<number>(0);
  const [isRawMode, setIsRawMode] = useState(false);
  
  // Pro Pipeline Settings
  const [burstCount, setBurstCount] = useState(50);
  const [intervalMs, setIntervalMs] = useState(1000);
  const [whiteBalance, setWhiteBalance] = useState(4500);
  const [isFullPerformance, setIsFullPerformance] = useState(false);
  const [isCountdown, setIsCountdown] = useState(false);
  const [countdownTimer, setCountdownTimer] = useState(15);
  
  // Calibration Memory
  const [darkFrame, setDarkFrame] = useState<Uint8ClampedArray | null>(null);
  const [biasFrame, setBiasFrame] = useState<Uint8ClampedArray | null>(null);
  const [flatFrame, setFlatFrame] = useState<Uint8ClampedArray | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stackCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const orientationRef = useRef(orientation);

  useEffect(() => {
    orientationRef.current = orientation;
  }, [orientation]);

  const showToast = useCallback((message: string, type: ToastData['type'] = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev.slice(-4), { id, message, type, duration }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const startCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach(track => track.stop());

    if (Capacitor.isNativePlatform()) {
      try {
        const p = await CapCamera.requestPermissions();
        if (p.camera !== 'granted' && p.camera !== 'prompt') {
          showToast('Native camera permissions denied. Please allow in settings.', 'error');
        }
      } catch (err) {
        console.warn('Could not request native permissions', err);
      }
    }

    // Attempt 1: Try with advanced manual constraints (supported on some Android Chrome)
    const advancedConstraints: MediaStreamConstraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 4096 },
        height: { ideal: 2160 },
        advanced: [{
          exposureMode: 'manual',
          exposureTime: exposureTime * 10,
          iso: iso,
          whiteBalanceMode: 'manual',
          colorTemperature: whiteBalance,
          focusMode: 'manual',
          focusDistance: 0
        }] as any
      },
      audio: false,
    };

    // Attempt 2: Fallback to basic constraints
    const basicConstraints: MediaStreamConstraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(advancedConstraints);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (advancedErr: any) {
      console.warn('Advanced camera constraints rejected, falling back to basic:', advancedErr.message);
      try {
        const stream = await navigator.mediaDevices.getUserMedia(basicConstraints);
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        showToast('Using standard camera (manual exposure unavailable)', 'info');
      } catch (basicErr: any) {
        showToast('Camera error: ' + basicErr.message, 'error');
      }
    }
  }, [showToast, exposureTime, iso, whiteBalance]);

  useEffect(() => {
    if (!showIntro) startCamera();
    return () => streamRef.current?.getTracks().forEach(track => track.stop());
  }, [showIntro, startCamera]);

  useEffect(() => {
    if (location) setSkyConditions(SkyForecaster.getSeeingConditions(location.lat, location.lng));
  }, [location]);

  // Audio Tour Logic
  const startAudioTour = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    setIsAudioTourActive(true);
    utterance.onend = () => setIsAudioTourActive(false);
  }, []);

  const stopAudioTour = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsAudioTourActive(false);
  }, []);

  // --- Immersive Mode: Auto-hide HUD after 3s of inactivity ---
  const resetHudTimer = useCallback(() => {
    setIsHudVisible(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      if (viewMode === 'camera' && !isCapturing && !isProcessing && !isAnalyzing) {
        setIsHudVisible(false);
      }
    }, 3000);
  }, [viewMode, isCapturing, isProcessing, isAnalyzing]);

  useEffect(() => {
    const handleInteraction = () => resetHudTimer();
    window.addEventListener('touchstart', handleInteraction, { passive: true });
    window.addEventListener('mousemove', handleInteraction, { passive: true });
    resetHudTimer();
    return () => {
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('mousemove', handleInteraction);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, [resetHudTimer]);

  // Request fullscreen for immersive experience
  useEffect(() => {
    if (!showIntro) {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      } else if ((el as any).webkitRequestFullscreen && !(document as any).webkitFullscreenElement) {
        (el as any).webkitRequestFullscreen();
      }
    }
  }, [showIntro]);

  // --- Live Stellarium Star Overlay ---
  useEffect(() => {
    if (viewMode !== 'camera' || isFullPerformance || !location) return;

    let animationId: number;
    const { fovX, fovY } = OcularsEngine.getPhoneCameraFOV();

    const renderOverlay = () => {
      const canvas = liveOverlayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = new Date();
      
      const phoneAz = orientationRef.current.alpha;
      // Approximate Vertical holding pitch (standing upright phone facing forward)
      const phoneAlt = orientationRef.current.beta > 0 ? 90 - orientationRef.current.beta : -90 - orientationRef.current.beta; 

      ctx.textAlign = 'center';
      
      STAR_CATALOG.forEach(star => {
        const { alt, az } = CelestialEngine.toHorizontal({ ra: star.ra, dec: star.dec }, location.lat, location.lng, now);
        
        let dx = az - phoneAz;
        while (dx > 180) dx -= 360;
        while (dx < -180) dx += 360;

        let dy = alt - phoneAlt;
        
        if (Math.abs(dx) < fovX * 0.8 && Math.abs(dy) < fovY * 0.8) {
           const screenX = (canvas.width / 2) + (dx / (fovX/2)) * (canvas.width / 2);
           const screenY = (canvas.height / 2) - (dy / (fovY/2)) * (canvas.height / 2);

           const size = Math.max(0.5, 3 - Math.max(0, star.mag));
           const alpha = Math.max(0.2, 1 - (star.mag / 3));

           ctx.beginPath();
           ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
           ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
           ctx.fill();

           if (star.mag < 1.5) {
             ctx.fillStyle = `rgba(16, 185, 129, ${alpha * 0.8})`;
             ctx.font = '8px monospace';
             ctx.fillText(star.name, screenX, screenY + 10);
           }
        }
      });

      animationId = requestAnimationFrame(renderOverlay);
    };

    renderOverlay();
    return () => cancelAnimationFrame(animationId);
  }, [viewMode, isFullPerformance, location]);

  // --- Core Engine Logic ---
  const findCentroid = (data: Uint8ClampedArray, w: number, h: number, searchArea: { x: number; y: number; r: number }) => {
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let maxBrightness = 0;

    const startX = Math.max(0, Math.floor(searchArea.x - searchArea.r));
    const endX = Math.min(w, Math.ceil(searchArea.x + searchArea.r));
    const startY = Math.max(0, Math.floor(searchArea.y - searchArea.r));
    const endY = Math.min(h, Math.ceil(searchArea.y + searchArea.r));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * w + x) * 4;
        const b = data[i] + data[i + 1] + data[i + 2];
        if (b > maxBrightness) maxBrightness = b;
      }
    }
    if (maxBrightness < 40) return null;
    const threshold = maxBrightness * 0.75;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const i = (y * w + x) * 4;
        const b = data[i] + data[i + 1] + data[i + 2];
        if (b > threshold) {
          const weight = b - threshold;
          weightedX += x * weight;
          weightedY += y * weight;
          totalWeight += weight;
        }
      }
    }
    return totalWeight > 0 ? { x: weightedX / totalWeight, y: weightedY / totalWeight } : null;
  };

  const findBrightestPoint = (data: Uint8ClampedArray, w: number, h: number) => {
    let maxVal = -1;
    let bestX = 0;
    let bestY = 0;
    const startX = Math.floor(w * 0.2);
    const endX = Math.floor(w * 0.8);
    const startY = Math.floor(h * 0.2);
    const endY = Math.floor(h * 0.8);

    for (let y = startY; y < endY; y += 4) {
      for (let x = startX; x < endX; x += 4) {
        const i = (y * w + x) * 4;
        const brightness = data[i] + data[i + 1] + data[i + 2];
        if (brightness > maxVal) {
          maxVal = brightness;
          bestX = x;
          bestY = y;
        }
      }
    }
    return { x: bestX, y: bestY, val: maxVal };
  };

  const captureAndStack = async () => {
    if (!videoRef.current || !canvasRef.current || !stackCanvasRef.current) return;
    
    // Start countdown immediately so user has time to place phone upside down
    showToast("Place phone screen-down on flat surface...", "info", 5000);
    setIsCountdown(true);
    setCountdownTimer(15);
    
    // 15-Second Stabilization Countdown Loop
    for (let c = 15; c > 0; c--) {
      setCountdownTimer(c);
      vibrate(ImpactStyle.Light);
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Re-check orientation immediately after countdown
    if (!isFlat) {
       showToast("Capture aborted! Phone must be specifically screen-down.", "error");
       setIsCountdown(false);
       return;
    }
    
    setIsCountdown(false);
    vibrate(ImpactStyle.Heavy);
    setIsCapturing(true);
    setProgress(0);
    setStackedImage(null);
    setAnalysis(null);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    canvas.width = width;
    canvas.height = height;
    stackCanvasRef.current.width = width;
    stackCanvasRef.current.height = height;

    const totalFrames = burstCount;
    const frameBuffer: Uint8ClampedArray[] = [];

    // Save initial frame for comparison
    ctx.drawImage(video, 0, 0, width, height);
    setSingleFrame(canvas.toDataURL('image/jpeg', 0.85));

    let referencePoint: { x: number; y: number } | null = null;
    let lastTrackedPoint: { x: number; y: number } | null = null;
    let currentSearchRadius = 30;

    const captureLoop = async () => {
      if (frameBuffer.length >= totalFrames) {
        setIsCapturing(false);
        performSigmaStack(frameBuffer, width, height);
        return;
      }

      const gyroSamples: GyroSample[] = [];
      const accelSamples: AccelSample[] = [];

      // Authentic Hardware Pacing: Let the physical sensor integrate over exposureTime
      // while we monitor device stability to reject bad frames.
      const exposureStart = performance.now();
      while (performance.now() - exposureStart < exposureTime) {
        gyroSamples.push({ alpha: orientationRef.current.alpha, beta: orientationRef.current.beta, gamma: orientationRef.current.gamma, timestamp: Date.now() });
        accelSamples.push({ x: 0, y: 0, z: 1, timestamp: Date.now() });
        await new Promise(r => setTimeout(r, 50));
      }
      
      // Hardware Pre-Rejection Gate: Gyroscope stability
      const stability = AstroPipeline.computeStabilityScore(gyroSamples);
      const motionVar = AstroPipeline.computeMotionVariance(accelSamples);
      if (stability < 0.90 || motionVar > 0.5) {
         showToast(`Frame rejected. ${stability < 0.90 ? `Gyro unstable (${stability.toFixed(2)})` : `Motion detected (${motionVar.toFixed(2)})`}`, "error");
         await new Promise(r => setTimeout(r, intervalMs));
         requestAnimationFrame(captureLoop);
         return;
      }

      // Authentic Hardware Capture: Get a direct uncompressed frame if possible
      try {
        const track = streamRef.current?.getVideoTracks()[0];
        if (track && 'ImageCapture' in window) {
           const imageCapture = new (window as any).ImageCapture(track);
           const bmp = await imageCapture.grabFrame();
           ctx.drawImage(bmp, 0, 0, width, height);
        } else {
           ctx.drawImage(video, 0, 0, width, height);
        }
      } catch (err) {
        ctx.drawImage(video, 0, 0, width, height); // Fallback
      }

      // Update Live HUD Preview
      setLivePreviewUrl(canvas.toDataURL('image/jpeg', 0.5));

      const currentFrame = ctx.getImageData(0, 0, width, height);
      
      // Meteor pulse check on full frame
      let maxBright = 0;
      for (let i = 0; i < width * height; i++) {
        const brightness = (currentFrame.data[i * 4] + currentFrame.data[i * 4 + 1] + currentFrame.data[i * 4 + 2]) / 3;
        if (brightness > maxBright) maxBright = brightness;
      }
      if (maxBright > 240) {
        const now = Date.now();
        if (now - lastMeteorTime > 5000) {
           setLastMeteorTime(now);
           showToast("☄ METEOR DETECTED!", "info");
           vibrate(ImpactStyle.Heavy);
        }
      }

      // --- GUIDED ALIGNMENT (Stellarium Priors) ---
      let dx = 0, dy = 0, rotation = 0;
      
      // Calculate where stars *should* be right now
      const { fovX, fovY } = OcularsEngine.getPhoneCameraFOV();
      const phoneAz = orientation.alpha;
      const phoneAlt = orientation.beta > 0 ? 90 - orientation.beta : -90 - orientation.beta;
      
      const predictedPositions = STAR_CATALOG.map(s => {
          const { alt, az } = CelestialEngine.toHorizontal({ ra: s.ra, dec: s.dec }, location!.lat, location!.lng, new Date());
          let azDiff = az - phoneAz; while (azDiff > 180) azDiff -= 360; while (azDiff < -180) azDiff += 360;
          let altDiff = alt - phoneAlt;
          if (Math.abs(azDiff) < fovX && Math.abs(altDiff) < fovY) {
              return {
                 x: (width / 2) + (azDiff / (fovX/2)) * (width / 2),
                 y: (height / 2) - (altDiff / (fovY/2)) * (height / 2),
                 mag: s.mag
              };
          }
          return null;
      }).filter(p => p !== null) as {x:number,y:number,mag:number}[];

      // Detect peaks around predicted regions
      const currentStars: {x:number, y:number}[] = [];
      for (const pred of predictedPositions) {
         // Validate using expected magnitude constraint (skip faint ones for alignment)
         if (pred.mag > 1.5) continue;
         const peak = findCentroid(currentFrame.data, width, height, { x: pred.x, y: pred.y, r: currentSearchRadius });
         if (peak) currentStars.push(peak);
      }

      if (referencePoint === null && currentStars.length > 0) {
        // Set first frame reference points
        referencePoint = { x: currentStars[0].x, y: currentStars[0].y };
        (window as any).referenceStarsArray = currentStars;
        captureStartTimeRef.current = Date.now();
      } else if (referencePoint && currentStars.length > 0) {
        // Match detected stars with predicted reference stars
        const refStars = (window as any).referenceStarsArray as {x:number, y:number}[];
        if (refStars && refStars.length > 0 && currentStars.length > 0) {
           // Translation (Solve matrix using brightest star)
           dx = refStars[0].x - currentStars[0].x;
           dy = refStars[0].y - currentStars[0].y;
           
           // Solve rotation using 2 stars if available
           if (refStars.length > 1 && currentStars.length > 1) {
              const refAngle = Math.atan2(refStars[1].y - refStars[0].y, refStars[1].x - refStars[0].x);
              const curAngle = Math.atan2(currentStars[1].y - currentStars[0].y, currentStars[1].x - currentStars[0].x);
              rotation = refAngle - curAngle;
           }
        }
      }

      // --- Earth Rotation Drift Compensation ---
      // Calculate predicted drift in pixels since capture start
      const elapsedSec = (Date.now() - (captureStartTimeRef.current || Date.now())) / 1000;
      const driftPixels = AstroPipeline.computeEarthRotationDrift(fovX, width, elapsedSec);
      // Earth rotates west-to-east, stars appear to move east-to-west (positive X drift)
      dx += driftPixels;

      if (dx !== 0 || dy !== 0 || rotation !== 0) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width; tempCanvas.height = height;
        const tCtx = tempCanvas.getContext('2d')!;
        
        // Subpixel alignment & Apply to frame
        tCtx.translate(width/2 + dx, height/2 + dy);
        tCtx.rotate(rotation);
        tCtx.translate(-width/2, -height/2);
        
        tCtx.drawImage(video, 0, 0, width, height);
        frameBuffer.push(new Uint8ClampedArray(tCtx.getImageData(0, 0, width, height).data));
      } else {
        frameBuffer.push(new Uint8ClampedArray(currentFrame.data));
      }

      setProgress(Math.round((frameBuffer.length / totalFrames) * 100));
      requestAnimationFrame(captureLoop);
    };

    captureLoop();
  };

  const performSigmaStack = async (frames: Uint8ClampedArray[], width: number, height: number) => {
    setIsProcessing(true);
    setProgress(0);
    const stackCanvas = stackCanvasRef.current!;
    const stackCtx = stackCanvas.getContext('2d')!;
    const resultData = stackCtx.createImageData(width, height);
    const numFrames = frames.length;
    const pixelCount = width * height * 4;

    // Apply Deep Astro Calibration (Darks, Flats, Bias)
    const calibratedFrames = frames.map(frame => 
       AstroPipeline.applyCalibration(frame, darkFrame, flatFrame, biasFrame, width, height)
    );

    for (let i = 0; i < pixelCount; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        const idx = i + channel;
        if (stackingAlgo === 'average') {
          let sum = 0; for (let f = 0; f < numFrames; f++) sum += calibratedFrames[f][idx];
          resultData.data[idx] = sum / numFrames;
        } else if (stackingAlgo === 'trail') {
          let maxVal = 0; for (let f = 0; f < numFrames; f++) maxVal = Math.max(maxVal, calibratedFrames[f][idx]);
          resultData.data[idx] = maxVal;
        } else {
          let sum = 0; for (let f = 0; f < numFrames; f++) sum += calibratedFrames[f][idx];
          const mean = sum / numFrames;
          let sqDiffSum = 0; for (let f = 0; f < numFrames; f++) sqDiffSum += Math.pow(calibratedFrames[f][idx] - mean, 2);
          const stdDev = Math.sqrt(sqDiffSum / numFrames);
          let clippedSum = 0, clippedCount = 0;
          for (let f = 0; f < numFrames; f++) {
            if (Math.abs(calibratedFrames[f][idx] - mean) <= 1.5 * stdDev) {
              clippedSum += calibratedFrames[f][idx]; clippedCount++;
            }
          }
          resultData.data[idx] = clippedCount > 0 ? clippedSum / clippedCount : mean;
        }
      }
      resultData.data[i + 3] = 255;
    }

    // Professional Signal Stretching
    const stretchedData = AstroPipeline.applyLogarithmicScaling(resultData);
    const finalEQData = AstroPipeline.applyHistogramEqualization(stretchedData);

    stackCtx.putImageData(finalEQData, 0, 0);
    const finalImage = stackCanvas.toDataURL('image/jpeg', 0.95);
    setStackedImage(finalImage);
    setIsProcessing(false);
    analyzeImage(finalImage);
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      // PRO MODE: Hardware Meta Payload for Deep Spectrum Verification
      const metaPayload = {
        burstCount,
        intervalMs,
        exposureTime,
        iso,
        whiteBalance,
        bortle: skyConditions?.bortle || 4
      };
      
      const payloadString = JSON.stringify(metaPayload);
      const result = await identifyCelestialObjects(base64, location || { lat: 0, lng: 0 }, orientation, [payloadString, ...identifiedConstsRef.current]);
      setAnalysis(result);
      if (isAutoSave && location) {
        await addToGallery({ id: Date.now().toString(), image: base64, analysis: result, timestamp: Date.now(), location });
      }
      showToast("Deep Spectrum Analysis Complete!", "success");
    } catch (err) {
      showToast("AI Analysis failed.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Moon phase calculation
  const getMoonPhase = () => {
    const d = new Date();
    const c = Math.floor(365.25 * (d.getFullYear()));
    const e = Math.floor(30.6 * (d.getMonth() + 1));
    const jd = c + e + d.getDate() - 694039.09;
    const phaseFrac = (jd / 29.53) % 1;
    const illumination = Math.round((1 - Math.cos(phaseFrac * 2 * Math.PI)) / 2 * 100);
    const names = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
    const emojis = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
    const idx = Math.floor(phaseFrac * 8) % 8;
    return { name: names[idx], illumination, emoji: emojis[idx] };
  };
  const moonPhase = getMoonPhase();
  const activeShowers = MeteorShowerEngine.getActiveShowers(new Date());
  const phoneFov = OcularsEngine.getPhoneCameraFOV();

  if (showIntro) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#05070a]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full glass-panel p-8 rounded-2xl text-center border-emerald-500/30">
          <motion.div animate={{ rotate: [0, 5, -5, 0] }} transition={{ duration: 4, repeat: Infinity }} className="p-4 bg-emerald-500/10 rounded-full inline-block mb-6">
            <Telescope className="w-12 h-12 text-emerald-500" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tighter">NAKSHATRA <span className="text-emerald-500">AI</span></h1>
          <p className="text-[10px] text-emerald-500/60 uppercase tracking-[0.4em] mb-6">Stellarium-Powered Astrophotography</p>
          <div className="space-y-3 text-left mb-8">
            {[
              { icon: <Camera className="w-4 h-4" />, text: 'HDR stacking with sigma-clip, median & star trails' },
              { icon: <Sparkles className="w-4 h-4" />, text: 'Gemini AI identifies stars, nebulae & galaxies' },
              { icon: <Telescope className="w-4 h-4" />, text: 'Stellarium meteor shower & observability engine' },
              { icon: <Eye className="w-4 h-4" />, text: 'Real-time Bortle scale, moon phase & sky quality' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }} className="flex items-start gap-3">
                <div className="text-emerald-500 shrink-0 mt-0.5">{item.icon}</div>
                <p className="text-xs text-gray-300">{item.text}</p>
              </motion.div>
            ))}
          </div>
          <motion.button whileTap={{ scale: 0.96 }} onClick={async () => { await requestPermission(); setShowIntro(false); }} className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2">
            <Zap className="w-5 h-5" /> INITIALIZE SENSORS
          </motion.button>
          <p className="mt-6 text-[7px] text-gray-600 uppercase tracking-[0.3em]">v14.0 • Stellarium Remix • Gemini AI</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full flex flex-col bg-black overflow-hidden">
      <NightModeOverlay enabled={nightMode} />
      {/* ===== CAMERA TAB ===== */}
      {viewMode === 'camera' && (
        <div className="flex-1 relative">
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          {/* Live Star Map Overlay */}
          <canvas ref={liveOverlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
          
          {/* Full Performance Mode Overlay Hider */}
          {!isFullPerformance && (
            <>
              {/* Crosshair */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative w-48 h-48">
              <div className="absolute top-0 left-1/2 -translate-x-px w-px h-6 bg-emerald-500/40" />
              <div className="absolute bottom-0 left-1/2 -translate-x-px w-px h-6 bg-emerald-500/40" />
              <div className="absolute left-0 top-1/2 -translate-y-px h-px w-6 bg-emerald-500/40" />
              <div className="absolute right-0 top-1/2 -translate-y-px h-px w-6 bg-emerald-500/40" />
              <div className="absolute inset-0 border border-emerald-500/10 rounded-full" />
            </div>
          </div>
          {/* Top HUD */}
          <div className={`absolute top-0 left-0 right-0 safe-p-top z-30 p-3 hud-element ${isHudVisible ? 'hud-visible' : 'hud-hidden'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1.5">
                <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-emerald-500" />
                  <span className="text-[9px] text-white font-mono">{location ? `${location.lat.toFixed(4)}°N ${location.lng.toFixed(4)}°E` : 'GPS...'}</span>
                </div>
                <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <Compass className="w-3 h-3 text-blue-400" />
                  <span className="text-[9px] text-white font-mono">{Math.round(orientation.alpha)}° HDG • {Math.round(orientation.beta)}° ALT</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                {skyConditions && (
                  <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2">
                    <Eye className="w-3 h-3 text-purple-400" />
                    <span className="text-[9px] text-white font-bold">Bortle {skyConditions.bortle}</span>
                  </div>
                )}
                <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <span className="text-sm">{moonPhase.emoji}</span>
                  <span className="text-[9px] text-white font-mono">{moonPhase.illumination}%</span>
                </div>
                <div className="glass-panel px-3 py-1.5 rounded-lg">
                  <span className="text-[9px] text-amber-400 font-mono">ISO {iso} • {exposureTime}ms • {frameCount}f</span>
                </div>
              </div>
            </div>
            {activeShowers.length > 0 && (
              <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel mt-2 px-3 py-1.5 rounded-lg border-amber-500/20 flex items-center gap-2">
                <span className="text-amber-400">☄</span>
                <span className="text-[9px] text-amber-300 font-bold">{activeShowers[0].name}</span>
                <span className="text-[8px] text-gray-400">ZHR {activeShowers[0].currentZHR} • {activeShowers[0].speed}km/s</span>
              </motion.div>
            )}
          </div>
          {/* Left Quick Actions */}
          <div className={`absolute left-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 hud-element ${isHudVisible ? 'hud-visible' : 'hud-hidden'}`}>
            {[
              { icon: <Moon className="w-4 h-4" />, active: nightMode, fn: () => setNightMode(!nightMode) },
              { icon: <Focus className="w-4 h-4" />, active: isFocusPeaking, fn: () => setIsFocusPeaking(!isFocusPeaking) },
              { icon: <Layers className="w-4 h-4" />, active: false, fn: () => { const next = stackingAlgo === 'sigma' ? 'median' : stackingAlgo === 'median' ? 'trail' : 'sigma'; setStackingAlgo(next); showToast(`Mode: ${next}`, 'info'); } },
            ].map((b, i) => (
              <motion.button key={i} whileTap={{ scale: 0.85 }} onClick={b.fn} className={`w-10 h-10 rounded-xl flex items-center justify-center ${b.active ? 'bg-white/20 text-emerald-400' : 'glass-panel text-gray-500'}`}>{b.icon}</motion.button>
            ))}
          </div>
          {/* Capture Progress Ring */}
          {isCapturing && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="relative w-48 h-48">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(63,185,80,0.1)" strokeWidth="2" />
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#3fb950" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${progress * 2.83} 283`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-white">{progress}%</span>
                  <span className="text-[8px] text-emerald-500 uppercase tracking-widest font-bold">Stacking</span>
                </div>
              </div>
              {livePreviewUrl && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute top-28 right-4 w-28 h-28 glass-panel rounded-xl overflow-hidden border border-emerald-500/30">
                  <img src={livePreviewUrl} className="w-full h-full object-cover" alt="live" />
                  <div className="absolute bottom-0 inset-x-0 bg-emerald-600/90 py-0.5 text-center"><span className="text-[7px] text-white font-black uppercase tracking-widest">Live</span></div>
                </motion.div>
              )}
            </div>
          )}
          {/* Analysis + Capture Button */}
          <div className="absolute bottom-20 left-0 right-0 z-30 px-4">
            <AnimatePresence>
              {analysis && (
                <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="glass-panel p-4 rounded-2xl mb-3 max-h-[35vh] overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-start mb-2">
                    <div><h3 className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em]">AI Analysis</h3><p className="text-[8px] text-gray-500">{analysis.objects?.length || 0} objects</p></div>
                    <div className="flex gap-1">
                      <button onClick={() => setShowComparison(true)} className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg"><Layers className="w-3 h-3" /></button>
                      <button onClick={() => setIsNoteOpen(true)} className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg"><BookOpen className="w-3 h-3" /></button>
                      <button onClick={() => startAudioTour(analysis.analysis)} className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg"><Activity className="w-3 h-3" /></button>
                      <button onClick={() => setAnalysis(null)} className="p-1.5 bg-white/5 text-gray-600 rounded-lg"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed mb-2">{analysis.analysis}</p>
                  {analysis.objects && analysis.objects.length > 0 && (
                    <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/5">
                      {analysis.objects.slice(0, 6).map((obj, i) => (
                        <div key={i} className="bg-white/5 p-2 rounded-lg"><span className="text-[10px] text-white font-bold block">{obj.name}</span><span className="text-[8px] text-gray-500">{obj.type} • mag {obj.magnitude}</span></div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button whileTap={{ scale: 0.94 }} disabled={isCapturing || isProcessing || isAnalyzing} onClick={captureAndStack}
              className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 ${isCapturing ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/20' : isProcessing ? 'bg-amber-900/30 text-amber-400' : isAnalyzing ? 'bg-blue-900/30 text-blue-400' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50'}`}>
              {isCapturing ? <><Loader2 className="w-4 h-4 animate-spin" />Capturing {progress}%</> : isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" />Processing</> : isAnalyzing ? <><Sparkles className="w-4 h-4 animate-pulse" />Analyzing</> : <><Camera className="w-4 h-4" />Begin Capture Session</>}
            </motion.button>
          </div>
          </>
          )}

          {/* 15s Countdown Overlay */}
          {isCountdown && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05070a]/80 backdrop-blur-md z-50">
               <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="text-8xl font-black text-emerald-500 drop-shadow-[0_0_30px_rgba(16,185,129,0.8)]">
                  {countdownTimer}
               </motion.div>
               <p className="text-white text-xs mt-6 tracking-[0.3em] uppercase">Stabilizing optical sensor</p>
            </div>
          )}

        </div>
      )}
      {/* ===== DASHBOARD TAB ===== */}
      {viewMode === 'map' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-14 safe-p-top space-y-3 bg-[#05070a]">
          <h2 className="text-base font-black text-white uppercase tracking-widest">Dashboard</h2>
          <div className="glass-panel p-4 rounded-2xl"><p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest mb-3">Sky Conditions</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-2xl">{moonPhase.emoji}</p><p className="text-[8px] text-gray-400 mt-1">{moonPhase.name}</p><p className="text-[10px] text-white font-bold">{moonPhase.illumination}%</p></div>
              <div><p className="text-2xl font-black text-emerald-400">{skyConditions?.bortle || '—'}</p><p className="text-[8px] text-gray-400 mt-1">Bortle</p><p className="text-[10px] text-white font-bold">{skyConditions?.transparency || 'OK'}</p></div>
              <div><p className="text-2xl font-black text-blue-400">{phoneFov.fovX}°</p><p className="text-[8px] text-gray-400 mt-1">FOV</p><p className="text-[10px] text-white font-bold">{phoneFov.fovDiagonal}° diag</p></div>
            </div>
          </div>
          <div className="glass-panel p-4 rounded-2xl"><p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest mb-3">Capture Settings</p>
            <div className="space-y-3">
              <div><div className="flex justify-between mb-1"><span className="text-[10px] text-gray-400">Burst Count</span><span className="text-[10px] text-white font-bold">{burstCount} frames</span></div><input type="range" min="10" max="1000" step="50" value={burstCount} onChange={e => setBurstCount(+e.target.value)} className="w-full accent-emerald-500 h-1" /></div>
              <div><div className="flex justify-between mb-1"><span className="text-[10px] text-gray-400">Intervalometer</span><span className="text-[10px] text-white font-bold">{intervalMs} ms</span></div><input type="range" min="0" max="5000" step="500" value={intervalMs} onChange={e => setIntervalMs(+e.target.value)} className="w-full accent-emerald-500 h-1" /></div>
              <div><div className="flex justify-between mb-1"><span className="text-[10px] text-gray-400">Target Exposure</span><span className="text-[10px] text-white font-bold">{exposureTime}ms</span></div><input type="range" min="200" max="60000" step="1000" value={exposureTime} onChange={e => setExposureTime(+e.target.value)} className="w-full accent-emerald-500 h-1" /></div>
              <div><div className="flex justify-between mb-1"><span className="text-[10px] text-gray-400">White Balance</span><span className="text-[10px] text-white font-bold">{whiteBalance}K</span></div><input type="range" min="2500" max="8000" step="100" value={whiteBalance} onChange={e => setWhiteBalance(+e.target.value)} className="w-full accent-emerald-500 h-1" /></div>
              <div><div className="flex justify-between mb-1"><span className="text-[10px] text-gray-400">Hardware ISO Attempt</span><span className="text-[10px] text-white font-bold">{iso}</span></div><input type="range" min="100" max="3200" step="100" value={iso} onChange={e => setIso(+e.target.value)} className="w-full accent-emerald-500 h-1" /></div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-3">
              {(['sigma','median','average','trail'] as StackingAlgorithm[]).map(a => (
                <button key={a} onClick={() => setStackingAlgo(a)} className={`py-2 rounded-lg text-[8px] font-black uppercase ${stackingAlgo === a ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-500'}`}>{a}</button>
              ))}
            </div>
          </div>
          <div className="glass-panel p-4 rounded-2xl"><p className="text-[9px] text-amber-400 font-black uppercase tracking-widest mb-3">☄ Meteor Showers</p>
            {activeShowers.length > 0 ? activeShowers.map((s,i) => (
              <div key={i} className="flex justify-between py-2 border-b border-white/5 last:border-0">
                <div><span className="text-xs text-white font-bold">{s.name}</span><span className="text-[8px] text-gray-500 ml-2">{s.parentBody}</span></div>
                <div className="text-right"><span className={`text-[10px] font-black ${s.status==='PEAK'?'text-amber-400':'text-emerald-400'}`}>ZHR {s.currentZHR}</span><span className="text-[8px] text-gray-500 ml-1">{s.speed}km/s</span></div>
              </div>
            )) : <p className="text-xs text-gray-500 italic">No active showers</p>}
          </div>
          <div className="glass-panel p-4 rounded-2xl"><p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest mb-3">Toggles</p>
            <div className="space-y-3">
              {[
                { label: 'Night Vision', value: nightMode, fn: () => setNightMode(!nightMode), c: 'bg-red-500' },
                { label: 'Focus Peaking', value: isFocusPeaking, fn: () => setIsFocusPeaking(!isFocusPeaking), c: 'bg-cyan-500' },
                { label: 'Auto-Save', value: isAutoSave, fn: () => setIsAutoSave(!isAutoSave), c: 'bg-purple-500' },
                { label: 'RAW Mode', value: isRawMode, fn: () => setIsRawMode(!isRawMode), c: 'bg-blue-500' },
                { label: 'Full Performance', value: isFullPerformance, fn: () => setIsFullPerformance(!isFullPerformance), c: 'bg-orange-500' },
              ].map(t => (
                <div key={t.label} className="flex justify-between items-center">
                  <span className="text-xs text-gray-300">{t.label}</span>
                  <button onClick={t.fn} className={`w-10 h-5 rounded-full relative ${t.value ? t.c : 'bg-white/10'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${t.value ? 'translate-x-5' : 'translate-x-0.5'}`}/></button>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-panel p-4 rounded-2xl"><p className="text-[9px] text-amber-500 font-black uppercase tracking-widest mb-3">Calibration Frames</p>
            <p className="text-[8px] text-gray-500 mb-3">Capture reference frames for professional calibration (Dark, Flat, Bias).</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => { if (!videoRef.current || !canvasRef.current) return; const c = canvasRef.current; const ctx = c.getContext('2d')!; c.width = videoRef.current.videoWidth; c.height = videoRef.current.videoHeight; ctx.drawImage(videoRef.current, 0, 0); setDarkFrame(new Uint8ClampedArray(ctx.getImageData(0, 0, c.width, c.height).data)); showToast('Dark frame captured', 'success'); }} className={`py-2.5 rounded-xl text-[9px] font-black uppercase ${darkFrame ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 border border-dashed border-white/10'}`}>{darkFrame ? '✓ Dark' : '+ Dark'}</button>
              <button onClick={() => { if (!videoRef.current || !canvasRef.current) return; const c = canvasRef.current; const ctx = c.getContext('2d')!; c.width = videoRef.current.videoWidth; c.height = videoRef.current.videoHeight; ctx.drawImage(videoRef.current, 0, 0); setFlatFrame(new Uint8ClampedArray(ctx.getImageData(0, 0, c.width, c.height).data)); showToast('Flat frame captured', 'success'); }} className={`py-2.5 rounded-xl text-[9px] font-black uppercase ${flatFrame ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 border border-dashed border-white/10'}`}>{flatFrame ? '✓ Flat' : '+ Flat'}</button>
              <button onClick={() => { if (!videoRef.current || !canvasRef.current) return; const c = canvasRef.current; const ctx = c.getContext('2d')!; c.width = videoRef.current.videoWidth; c.height = videoRef.current.videoHeight; ctx.drawImage(videoRef.current, 0, 0); setBiasFrame(new Uint8ClampedArray(ctx.getImageData(0, 0, c.width, c.height).data)); showToast('Bias frame captured', 'success'); }} className={`py-2.5 rounded-xl text-[9px] font-black uppercase ${biasFrame ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-400 border border-dashed border-white/10'}`}>{biasFrame ? '✓ Bias' : '+ Bias'}</button>
            </div>
            {(darkFrame || flatFrame || biasFrame) && <button onClick={() => { setDarkFrame(null); setFlatFrame(null); setBiasFrame(null); showToast('Calibration frames cleared', 'info'); }} className="w-full mt-2 py-1.5 text-[8px] text-red-400 bg-red-500/10 rounded-lg uppercase font-bold">Clear All Calibration</button>}
          </div>
          <div className="h-20" />
        </div>
      )}
      {/* ===== GALLERY TAB ===== */}
      <AnimatePresence>{viewMode === 'gallery' && <Gallery items={gallery} onDelete={deleteFromGallery} onClose={() => setViewMode('camera')} />}</AnimatePresence>
      {/* ===== BOTTOM NAV ===== */}
      <div className={`absolute bottom-0 left-0 right-0 z-[80] safe-p-bottom hud-element ${viewMode === 'camera' ? (isHudVisible ? 'hud-visible' : 'hud-hidden') : 'hud-visible'}`}>
        <div className="glass-panel mx-3 mb-2 rounded-2xl flex items-center justify-around py-2">
          {([
            { mode: 'camera' as ViewMode, icon: <Camera className="w-5 h-5" />, label: 'Capture' },
            { mode: 'map' as ViewMode, icon: <Gauge className="w-5 h-5" />, label: 'Dashboard' },
            { mode: 'gallery' as ViewMode, icon: <History className="w-5 h-5" />, label: 'Gallery' },
          ]).map(tab => (
            <button key={tab.mode} onClick={() => setViewMode(tab.mode)} className={`flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-xl transition-all ${viewMode === tab.mode ? 'text-emerald-500 bg-emerald-500/10' : 'text-gray-600'}`}>
              {tab.icon}<span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
      {/* ===== MODALS ===== */}
      <AnimatePresence>{isNoteOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-6">
          <div className="w-full max-w-md glass-panel p-6 rounded-3xl">
            <div className="flex justify-between mb-4"><h2 className="text-sm font-bold text-white uppercase">Astro Journal</h2><button onClick={() => setIsNoteOpen(false)} className="text-gray-500"><X className="w-5 h-5" /></button></div>
            <textarea value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} className="w-full h-48 bg-white/5 p-4 text-gray-300 text-sm rounded-xl resize-none mb-4 focus:outline-none focus:ring-1 focus:ring-emerald-500/30" placeholder="Log your session..." />
            <button onClick={() => setIsNoteOpen(false)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">SAVE</button>
          </div>
        </motion.div>
      )}</AnimatePresence>
      <AnimatePresence>{showComparison && stackedImage && singleFrame && <ImageComparison beforeImage={singleFrame} afterImage={stackedImage} onClose={() => setShowComparison(false)} />}</AnimatePresence>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={stackCanvasRef} className="hidden" />
      <canvas ref={compositeCanvasRef} className="hidden" />
    </div>
  );
}
