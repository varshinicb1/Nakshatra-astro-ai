import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  type BannerAdOptions,
  type AdOptions,
} from '@capacitor-community/admob';

// Google's official AdMob test ad unit IDs. Swap these for real ad unit IDs (from your
// AdMob console) via the VITE_ADMOB_* env vars before a production release — shipping the
// test IDs to Play Store means the app will never actually earn ad revenue.
const BANNER_AD_UNIT_ID = import.meta.env.VITE_ADMOB_BANNER_ID || 'ca-app-pub-3940256099942544/6300978111';
const INTERSTITIAL_AD_UNIT_ID = import.meta.env.VITE_ADMOB_INTERSTITIAL_ID || 'ca-app-pub-3940256099942544/1033173712';

let initialized = false;

export async function initAds(): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) return;
  try {
    await AdMob.initialize({
      // Explicitly mark test devices via VITE_ADMOB_TEST_DEVICE_IDS during development;
      // never ship a build with testingDevices populated in production.
      testingDevices: import.meta.env.VITE_ADMOB_TEST_DEVICE_IDS?.split(',').filter(Boolean) || [],
      initializeForTesting: import.meta.env.DEV,
    });
    initialized = true;
  } catch (err) {
    console.warn('AdMob init failed (ads will be unavailable):', err);
  }
}

export async function showBanner(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const options: BannerAdOptions = {
      adId: BANNER_AD_UNIT_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      isTesting: import.meta.env.DEV,
    };
    await AdMob.showBanner(options);
  } catch (err) {
    console.warn('Banner ad failed to show:', err);
  }
}

export async function hideBanner(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.hideBanner();
  } catch (err) {
    // Ignore — banner may never have been shown
  }
}

export async function removeBanner(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await AdMob.removeBanner();
  } catch (err) {
    // Ignore
  }
}

/**
 * Shows a full-screen interstitial ad. Intended to be called at natural break points only
 * (e.g. after a completed capture+analysis session) — never mid-capture, which would
 * interrupt the core astrophotography flow.
 */
export async function showInterstitial(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const options: AdOptions = {
      adId: INTERSTITIAL_AD_UNIT_ID,
      isTesting: import.meta.env.DEV,
    };
    await AdMob.prepareInterstitial(options);
    await AdMob.showInterstitial();
  } catch (err) {
    console.warn('Interstitial ad failed to show:', err);
  }
}
