import { Preferences } from '@capacitor/preferences';
import { apiClient } from './apiClient';

const AD_FREE_KEY = 'nakshatra_ad_free_unlocked';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load payment gateway.')));
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load payment gateway.'));
    document.head.appendChild(script);
  });
}

export async function isAdFreeUnlocked(): Promise<boolean> {
  const { value } = await Preferences.get({ key: AD_FREE_KEY });
  return value === 'true';
}

async function markAdFreeUnlocked(): Promise<void> {
  await Preferences.set({ key: AD_FREE_KEY, value: 'true' });
}

/**
 * Runs the full one-time ₹199 ad-free purchase flow:
 * 1. Ask our backend to create a Razorpay order (server sets the price — never trust a client amount).
 * 2. Open Razorpay Checkout for the user to pay.
 * 3. Send the checkout response back to our backend to verify the cryptographic signature.
 * 4. Only on verified success, persist the ad-free unlock locally so it survives app restarts.
 */
export async function purchaseAdFree(userEmail?: string): Promise<{ success: boolean; error?: string }> {
  try {
    await loadRazorpayScript();
    const order = await apiClient.createPaymentOrder();

    return await new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Nakshatra Astro-AI',
        description: 'Ad-Free Unlock (one-time)',
        prefill: userEmail ? { email: userEmail } : undefined,
        theme: { color: '#10b981' },
        handler: async (response: any) => {
          try {
            const verification = await apiClient.verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature,
            );
            if (verification.verified) {
              await markAdFreeUnlocked();
              resolve({ success: true });
            } else {
              resolve({ success: false, error: 'Payment could not be verified.' });
            }
          } catch (err: any) {
            resolve({ success: false, error: err.message || 'Payment verification failed.' });
          }
        },
        modal: {
          ondismiss: () => resolve({ success: false, error: 'Payment cancelled.' }),
        },
      });
      rzp.open();
    });
  } catch (err: any) {
    return { success: false, error: err.message || 'Could not start payment.' };
  }
}
