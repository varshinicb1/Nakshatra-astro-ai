# Play Console Setup — Copy/Paste Content

## App signing SHA-256 fingerprint
```
B7:70:E5:DD:C0:59:EE:D7:57:C0:83:0F:69:B3:70:B6:CC:D7:86:AC:7D:A4:3D:F3:88:CC:0E:46:1D:13:65:F2
```

---

## Store Listing

**App name:** Nakshatra Astro-AI

**Short description** (max 80 chars):
```
Capture stars & galaxies with your phone camera. AI sky ID, real astrophotography.
```
(79 chars)

**Full description:**
```
Nakshatra Astro-AI turns your ordinary phone camera into a real astrophotography tool — no telescope required.

WHAT IT DOES
- Sensor-gated intervalometer: monitors your phone's gyroscope and accelerometer in real time and only keeps frames that are actually stable, just like a real long-exposure camera.
- Star-catalog guided alignment: compensates for Earth's rotation and aligns every frame using real star positions, not guesswork.
- Sigma-clip image stacking: combines dozens of frames mathematically to reveal detail no single phone photo could ever capture, while rejecting satellite trails, plane lights, and noise.
- Dark/flat/bias calibration: supports proper astronomical calibration frames for cleaner results.
- Real-time meteor detection: flags genuine meteor streaks during capture, so you don't miss them.
- AI-powered sky identification: analyzes your photo along with your location and orientation to identify constellations, stars, and deep-sky objects.
- Live Bortle scale measurement: estimates your local light pollution from your actual camera feed, not just your coordinates.
- Interactive sky map: pan and zoom through a real star catalog and see what you've captured plotted at its true coordinates.
- Red-shift night vision UI: preserves your night vision in the field.

WHO IT'S FOR
Anyone curious about the night sky — from complete beginners in a backyard to serious amateur astrophotographers who want a serious tool that doesn't require expensive equipment.

Free to use, supported by ads. Remove ads permanently with a one-time in-app purchase.
```

**App category:** Photography (alternative: Tools)

**Contact details:**
- Email: [YOUR CONTACT EMAIL — fill in]
- Website (optional): leave blank, or your GitHub repo URL if you want one public
- Phone (optional): leave blank

**Privacy Policy URL:**
`public/privacy.html` is drafted in the repo — needs to be hosted at a public HTTPS URL (see PLAY_STORE_LAUNCH.md section 2). Paste that URL here once it's live. Do NOT leave this blank — camera + location apps require it.

---

## App Content Questionnaire

**Ads:** Yes, this app contains ads (AdMob banner + interstitial).

**Content rating questionnaire answers:**
- Violence: None
- Sexual content: None
- Profanity: None
- Controlled substances: None
- Gambling: None
- User-generated content shared publicly: No (gallery is local-only, no sharing/upload features to other users)
- Location sharing: Yes — used for astronomy calculations, not shared publicly
- Personal info collected: Camera, location (see Data Safety below)
Expect a rating of "Everyone" / "3+" or similar — nothing in this app should trigger a higher rating.

**Target audience & content:**
- Target age group: 18+ recommended given it's a general-purpose tool with in-app purchases, but not restricted to adults — you can select a broader range (13+) if preferred. Avoid selecting "primarily for children" — this is not a children's app and that designation triggers stricter COPPA-related requirements you don't need.
- Appeals to children: No

**Government apps:** No
**Financial features:** No (the ad-free unlock is a standard Play Billing digital purchase, not a financial services feature — answer "No" here)
**Health:** No

---

## Data Safety Section

Declare the following (matches `public/privacy.html`):

| Data type | Collected? | Shared? | Purpose |
|---|---|---|---|
| Camera / Photos | Yes | No | App functionality (astrophotography capture) |
| Precise location | Yes | With NVIDIA's NIM API only, per-request, for AI analysis | App functionality (sky calculations, AI analysis) |
| Device or other IDs (Advertising ID) | Yes | With Google AdMob | Advertising |
| Purchase history | Yes | With Google Play Billing | App functionality (ad-free unlock) |

- Is data encrypted in transit? Yes (HTTPS to backend, HTTPS to NVIDIA NIM)
- Can users request data deletion? Yes — all data (gallery, settings) is stored locally on-device; uninstalling the app deletes it. Mention this if the form asks for a deletion mechanism.

---

## Internal Testing (do this first — you already have this page open)

1. Upload the AAB (once the final one is built with real key, ad IDs, server URL — see PLAY_STORE_LAUNCH.md)
2. Release name: auto-suggested is fine (e.g. "1.0.0 (1)")
3. Release notes (`en-IN`):
```
Initial release. Real-time astrophotography with AI-powered sky identification.
```
4. Add yourself as a tester under the "Testers" tab before this is useful

## Closed Testing (needed before Production access)

- Requires **at least 12 opted-in testers for 14 days** before you can apply for production access — start recruiting testers early (friends, family, a Reddit astro community, etc.) since this is a hard requirement, not optional
- Use the same AAB as internal testing once it's finalized

## Production Access Application

- You'll be asked questions about your closed test — answer honestly based on tester feedback
- Only apply once the 12-tester/14-day closed test requirement is met
