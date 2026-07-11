import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const AD_FREE_KEY = 'nakshatra_ad_free_unlocked';

// Must match the in-app product ID you configure in Play Console under
// Monetize > Products > In-app products (one-time, non-consumable, ₹199).
export const AD_FREE_PRODUCT_ID = 'nakshatra_ad_free_unlock';

declare global {
  interface Window {
    CdvPurchase?: any;
  }
}

let initPromise: Promise<void> | null = null;

/**
 * Initializes Google Play Billing via cordova-plugin-purchase (a free, open-source,
 * widely-used Cordova/Capacitor plugin — works without any third-party payment gateway
 * or KYC approval, since it rides on the developer's already-approved Play Console account).
 * Registers the ad-free product and wires purchase lifecycle handlers that persist the
 * unlock locally once Google's own receipt verification approves it.
 */
function ensureInitialized(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    if (!Capacitor.isNativePlatform() || !window.CdvPurchase) {
      resolve(); // web/dev fallback — purchases simply won't be available
      return;
    }

    const { store, ProductType, Platform } = window.CdvPurchase;

    store.register([{
      id: AD_FREE_PRODUCT_ID,
      type: ProductType.NON_CONSUMABLE,
      platform: Platform.GOOGLE_PLAY,
    }]);

    store.when().approved((transaction: any) => transaction.verify());
    store.when().verified((receipt: any) => receipt.finish());
    store.when().finished(async (transaction: any) => {
      if (transaction.products.some((p: any) => p.id === AD_FREE_PRODUCT_ID)) {
        await Preferences.set({ key: AD_FREE_KEY, value: 'true' });
      }
    });

    store.error((err: any) => console.warn('Play Billing error:', err));

    store.initialize([Platform.GOOGLE_PLAY]).then(() => resolve()).catch(() => resolve());
  });

  return initPromise;
}

export async function isAdFreeUnlocked(): Promise<boolean> {
  const { value } = await Preferences.get({ key: AD_FREE_KEY });
  if (value === 'true') return true;

  // Also check Play Billing's own record in case local storage was cleared but the user
  // already owns the product (e.g. reinstall) — Play Billing restores ownership automatically.
  await ensureInitialized();
  if (Capacitor.isNativePlatform() && window.CdvPurchase) {
    const owned = window.CdvPurchase.store.get(AD_FREE_PRODUCT_ID)?.owned;
    if (owned) {
      await Preferences.set({ key: AD_FREE_KEY, value: 'true' });
      return true;
    }
  }
  return false;
}

/**
 * Runs the one-time ₹199 ad-free purchase through Google Play Billing. This opens Google's
 * own native purchase sheet — no external checkout, no card details ever touch this app.
 */
export async function purchaseAdFree(): Promise<{ success: boolean; error?: string }> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: 'Purchases are only available in the installed app.' };
  }
  await ensureInitialized();
  if (!window.CdvPurchase) {
    return { success: false, error: 'Play Billing is unavailable on this device.' };
  }

  const { store } = window.CdvPurchase;
  const product = store.get(AD_FREE_PRODUCT_ID);
  if (!product?.getOffer()) {
    return { success: false, error: 'Ad-free product is not available yet. Please try again shortly.' };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finishedHandler = (transaction: any) => {
      if (!settled && transaction.products.some((p: any) => p.id === AD_FREE_PRODUCT_ID)) {
        settled = true;
        resolve({ success: true });
      }
    };
    const errorHandler = (err: any) => {
      if (!settled) {
        settled = true;
        resolve({ success: false, error: err?.message || 'Purchase failed.' });
      }
    };

    store.when().finished(finishedHandler);
    store.error(errorHandler);

    product.getOffer().order().catch(errorHandler);

    // Safety timeout in case the user backgrounds the app mid-purchase and no event fires.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ success: false, error: 'Purchase timed out. If you completed payment, restart the app to sync.' });
      }
    }, 60000);
  });
}
