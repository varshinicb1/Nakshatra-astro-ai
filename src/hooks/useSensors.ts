import { useState, useEffect, useCallback, useRef } from 'react';

interface Orientation {
  alpha: number;
  beta: number;
  gamma: number;
}

interface Location {
  lat: number;
  lng: number;
}

// --- High-Performance Kalman Filter for Physics-Based Smoothing ---
class KalmanFilter {
  private q: number; // Process noise
  private r: number; // Measurement noise
  private x: number; // Estimated value
  private p: number; // Error covariance
  private k: number; // Kalman gain

  constructor(q = 0.05, r = 0.5, initialX = 0) {
    this.q = q;
    this.r = r;
    this.x = initialX;
    this.p = 1.0;
    this.k = 0;
  }

  update(measurement: number): number {
    // Prediction
    this.p = this.p + this.q;

    // Correction (Update)
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;

    return this.x;
  }
}

export interface AccelReading {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

export function useSensors() {
  const [orientation, setOrientation] = useState<Orientation>({ alpha: 0, beta: 0, gamma: 0 });
  const [location, setLocation] = useState<Location | null>(null);
  const [isFlat, setIsFlat] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Latest raw accelerometer reading, updated on every 'devicemotion' event.
  // Exposed via a ref (not state) so high-frequency updates don't trigger re-renders;
  // consumers read accelRef.current directly during a capture loop.
  const accelRef = useRef<AccelReading>({ x: 0, y: 0, z: 1, timestamp: Date.now() });

  const watchIdRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  
  // Persistent filter instances
  const filtersRef = useRef({
    alpha: new KalmanFilter(0.01, 1), // Low noise for smoother rotation
    beta: new KalmanFilter(0.05, 0.5), // Faster for tilt
    gamma: new KalmanFilter(0.05, 0.5),
  });

  const requestPermission = useCallback(async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        if (response === 'granted') setPermissionGranted(true);
      } catch (err) {
        setPermissionGranted(true);
      }
    } else {
      setPermissionGranted(true);
    }
    // iOS 13+ also gates devicemotion behind its own permission prompt.
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        await (DeviceMotionEvent as any).requestPermission();
      } catch (err) {
        // ignore — accelerometer simply won't fire if denied
      }
    }
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const alphaRaw = e.alpha || 0;
      const betaRaw = e.beta || 0;
      const gammaRaw = e.gamma || 0;

      // Wrap-around handling for Alpha (0-360) is handled naturally by the filter convergence
      // but we can help it if needed. For now, simple Kalman is very robust.
      const smoothed = {
        alpha: filtersRef.current.alpha.update(alphaRaw),
        beta: filtersRef.current.beta.update(betaRaw),
        gamma: filtersRef.current.gamma.update(gammaRaw),
      };

      setOrientation(smoothed);

      // Face down check: screen facing ground, main camera facing sky.
      // Beta is around 180 or -180. Gamma is around 0.
      const flatThreshold = 15;
      const isFaceDownNow = Math.abs(Math.abs(betaRaw) - 180) < flatThreshold && Math.abs(gammaRaw) < flatThreshold;
      setIsFlat(isFaceDownNow);
    };

    window.addEventListener('deviceorientation', handleOrientation);

    const handleMotion = (e: DeviceMotionEvent) => {
      // Prefer gravity-inclusive acceleration (what a real IMU reports at rest: ~1g on the
      // stationary axis); fall back to accelerationIncludingGravity if `acceleration` is null.
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      accelRef.current = {
        x: acc.x / 9.81, // normalize m/s^2 -> g so downstream variance math matches the {x,y,z:1} baseline
        y: acc.y / 9.81,
        z: acc.z / 9.81,
        timestamp: Date.now(),
      };
    };
    window.addEventListener('devicemotion', handleMotion);

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationError(null);
        },
        (err) => {
          setLocationError(err.message);
          navigator.geolocation.getCurrentPosition(
            (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {}
          );
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
      );
    } catch (err) {
      setLocationError('Geolocation not supported');
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [permissionGranted]);

  return {
    orientation,
    location,
    isFlat,
    requestPermission,
    permissionGranted,
    locationError,
    accelRef,
  };
}
