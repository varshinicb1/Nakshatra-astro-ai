import { useState, useEffect, useCallback } from 'react';
import { isAdFreeUnlocked, purchaseAdFree } from '../services/monetization';
import { initAds, showBanner, hideBanner, removeBanner, showInterstitial } from '../services/ads';

export function useMonetization() {
  const [isAdFree, setIsAdFree] = useState<boolean | null>(null); // null = not yet loaded
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const unlocked = await isAdFreeUnlocked();
      if (cancelled) return;
      setIsAdFree(unlocked);
      if (!unlocked) {
        await initAds();
        await showBanner();
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const purchase = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setIsPurchasing(true);
    try {
      const result = await purchaseAdFree();
      if (result.success) {
        setIsAdFree(true);
        await removeBanner();
      }
      return result;
    } finally {
      setIsPurchasing(false);
    }
  }, []);

  // Call after a completed capture+analysis session (natural break point, never mid-capture).
  const maybeShowInterstitial = useCallback(async () => {
    if (isAdFree) return;
    await showInterstitial();
  }, [isAdFree]);

  return {
    isAdFree: isAdFree ?? true, // default to no-ads until we know, rather than flashing ads on
    isPurchasing,
    purchase,
    maybeShowInterstitial,
  };
}
