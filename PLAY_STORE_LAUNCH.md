# Play Store Launch Checklist — Nakshatra Astro-AI

This is the punch list between "code is done" and "app is live on the Play Store."
Items are grouped by what kind of work they are. Nothing here is optional unless marked so.

---

## 1. Security — do these first, before anything else

- [x] **Rotate the release keystore.** Done — `android/play-release.keystore` is the new signing
  key, wired via `android/keystore.properties` (gitignored). **Back this keystore up somewhere
  safe outside git** — if you lose it, you can never update the app again under the same package
  name. The old `nakshatra-release.keystore` is no longer used for signing; its committed
  password should still be considered burned.

- [ ] **Generate a real `APP_SECRET_TOKEN`.**
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Set it as `APP_SECRET_TOKEN` on the server and `VITE_APP_TOKEN` on the client build — they
  must match. `.env.local` currently still has the placeholder value — generate and set a real
  one before the final production build.

- [x] **Get a real AI API key.** Switched from Gemini to **NVIDIA NIM** (free-tier vision model,
  `meta/llama-3.2-11b-vision-instruct`) since it needs no billing/credit card and the key already
  works end-to-end (tested locally). Get your own free key at
  [build.nvidia.com](https://build.nvidia.com/) → sign in → open any model → "Get API Key".
  Set as `NVIDIA_NIM_API_KEY` server-side only.

- [ ] **Create the ad-free in-app product in Play Console.** The ₹199 unlock is handled
  entirely by Google Play Billing now (no Razorpay, no third-party gateway, no separate KYC —
  it rides on your already-approved Play Developer account). In Play Console:
  Monetize > Products > In-app products > Create product, with:
  - Product ID: `nakshatra_ad_free_unlock` (must match exactly —
    see `AD_FREE_PRODUCT_ID` in `src/services/monetization.ts`)
  - Type: one-time purchase (non-consumable)
  - Price: ₹199
  Note: Play Billing test purchases only work on a build installed via **Internal Testing**
  track or later (a locally sideloaded debug APK won't be able to complete a real purchase) —
  see §4 for how to test this.

- [x] **Get a real AdMob account + ad unit IDs.** Done — real App ID, Banner, and Interstitial
  unit IDs are wired into `AndroidManifest.xml` and `.env.local`. New ad units can take up to an
  hour to start actually serving ads after creation.

---

## 2. Infrastructure — things that need to be deployed/hosted

- [ ] **Deploy `server/`** somewhere with a public HTTPS URL. This backend only handles NVIDIA
  NIM AI analysis and weather/ISS/APOD proxying now (payments moved to Google Play Billing, no
  server involvement needed there) — but the app still needs it for the AI identification
  feature to work. A ready-to-use `render.yaml` blueprint is included in this repo:
  1. Push this repo to GitHub if it isn't already.
  2. On [render.com](https://render.com): **New > Blueprint**, connect this repo — Render reads
     `render.yaml` automatically and provisions the service.
  3. In the new service's **Environment** tab, fill in `NVIDIA_NIM_API_KEY` and `APP_SECRET_TOKEN`
     (marked `sync: false` in the blueprint so they're never committed to git).
  4. Copy the resulting `https://<name>.onrender.com` URL for the next step.

  Free tier note: the service spins down after ~15 min idle and takes ~30-50s to wake on the
  next request — fine for a personal-scale app; upgrade to Render's $7/mo tier later if that
  cold start ever becomes a problem.

- [ ] **Point the client at the deployed server.** Set `VITE_API_URL` to the real server URL
  before building the production APK/AAB (not `http://localhost:3001`).

- [ ] **Host `public/privacy.html` at a public HTTPS URL.** The Play Console requires an
  externally-reachable privacy policy URL for the store listing — the in-app relative link
  (`/privacy.html`) is not enough by itself. Cheapest options: GitHub Pages, Cloudflare Pages,
  or serve it as a static route off the same host as your backend. Once you have the URL,
  also update the link in `src/App.tsx`'s intro screen to point to it (currently `/privacy.html`
  works in-app but external reviewers/Play Console need the standalone URL).

---

## 3. Build — producing the actual release artifact

- [ ] Play Store requires an **Android App Bundle (.aab)**, not an APK, for new app submissions.
  ```
  npm run build
  npx cap sync android
  cd android
  ./gradlew bundleRelease
  ```
  Output lands at `android/app/build/outputs/bundle/release/app-release.aab`.

- [ ] Confirm the build is signed with the **new, rotated** keystore (see §1), not the old
  compromised one.

- [ ] Bump `versionCode` and `versionName` in `android/app/build.gradle` for this release
  (currently `versionCode 1` / `"1.0.0"` — fine for a first submission, but you'll need to
  increment on every future update).

- [ ] Verify `minSdkVersion`/`targetSdkVersion` in `android/variables.gradle` meet current Play
  Store requirements (Play Console enforces a minimum target API level that changes yearly —
  check the current requirement at submission time).

---

## 4. Manual testing on a real device

Everything below has been typechecked and built successfully, but **not yet exercised on real
hardware**. Do this before submitting — emulators won't reliably reproduce sensor/camera behavior.

- [ ] Full capture session end-to-end: countdown → burst capture → stacking → AI analysis →
  gallery save
- [ ] Accelerometer-based frame rejection actually triggers when you shake the phone mid-exposure
- [ ] Meteor detection does **not** false-positive on a static bright star or the moon
- [ ] Bortle scale updates sensibly between a bright room and a dark environment (it's now
  measured from actual camera brightness, not GPS)
- [ ] Deep-sky object identification only reports objects plausibly in frame, not everything
  in the catalog
- [ ] Sky Map tab renders, pans/zooms, and plots identified objects at sane positions
- [ ] Ad-free purchase flow end-to-end via Google Play Billing: upload a build to the **Internal
  Testing** track (Play Billing purchases don't work on a locally sideloaded debug build),
  install it via the testing link, and use a [Play Console license test account](https://play.google.com/console)
  (Setup > License testing) to complete a test purchase for free before spending real money
- [ ] Confirm the purchase unlocks ad-free immediately, the banner disappears, and it survives
  an app restart and a reinstall (Play Billing should restore ownership automatically)
- [ ] Once confident, do one real ₹199 purchase yourself (non-test account) to confirm the live
  product works end-to-end before public launch
- [ ] Ads display correctly for non-paying state and stay hidden after purchase
- [ ] App doesn't crash on: permission denial (camera/location), losing GPS mid-capture, backgrounding
  during capture, low storage, airplane mode (offline behavior)
- [ ] Test on at least one low-end/older Android device if possible — the frame-buffer memory
  cap added in this pass should prevent OOM crashes on large bursts, but it's worth confirming

---

## 5. Play Console account & listing (not code — done on play.google.com)

- [ ] Google Play Developer account — **$25 one-time fee**, if you don't already have one
- [ ] App listing:
  - [ ] Short description (≤80 chars)
  - [ ] Full description
  - [ ] App icon (512×512 PNG)
  - [ ] Feature graphic (1024×500 PNG/JPG)
  - [ ] At least 2 phone screenshots (real ones from the finished app, not the old placeholder
    APKs in the repo root)
- [ ] **Privacy Policy URL** — the public URL from §2
- [ ] **Data safety section** — declare what the app collects and why. Based on what the app
  actually does now:
  - Camera (photos) — used for core functionality, not shared
  - Location (precise) — used for core functionality (sky calculations) + sent with AI analysis
    requests, not shared with third parties beyond NVIDIA's NIM API for that specific request
  - Device/advertising ID — collected by AdMob for ads
  - Payment info — handled entirely by Google Play Billing, app never sees card details
- [ ] **Content rating questionnaire** — this is a general-audience astrophotography tool, should
  rate low/no content concerns
- [ ] **Ads declaration** — declare the app contains ads (required since AdMob is integrated)
- [ ] **Target audience & content** — set appropriate age range
- [ ] App category — likely "Photography" or "Tools"
- [ ] Contact email/website for the listing

---

## 6. Post-submission

- [ ] Play Store review typically takes a few hours to a few days for a first submission —
  budget for it, don't assume same-day approval
- [ ] Watch for policy rejection reasons related to permissions (camera/location — make sure the
  in-app rationale/first-run prompts clearly explain why each is needed, since Play reviewers
  check this)
- [ ] After approval, do one final real-device install from the Play Store listing itself (not
  a sideloaded build) to confirm the production config (real API keys, real ad units, real
  payment) all works end-to-end

---

## Quick reference: what's already done (from the code-side hardening pass)

These don't need re-verification, just listed for context:
- Fake Bortle scale, meteor detection, DSO identification, and SkyMap star field replaced with
  real implementations
- Real accelerometer wired in
- Crash-safety: try/catch around capture loop and stacking, frame buffer memory capped
- Keystore rotated — `android/play-release.keystore` is the new signing key (§1, done)
- Unused dangerous permissions (`RECORD_AUDIO`, legacy storage) removed from the manifest
- Hardcoded shared-secret fallback removed from `APP_SECRET_TOKEN` (still needs a real generated
  value set before the final build, §1)
- AdMob integration built and wired with real App ID + Banner + Interstitial unit IDs (§1, done)
- Payment moved to Google Play Billing (`cordova-plugin-purchase`) — no third-party gateway,
  no separate KYC, no payment code left on the server at all (still needs the in-app product
  created in Play Console, §1)
- AI analysis switched from Gemini to **NVIDIA NIM** (free-tier vision model) — tested working
  end-to-end locally with a real key (§1, done)
- `public/privacy.html` drafted (needs public hosting, §2)
- `render.yaml` blueprint added for one-click free backend hosting on Render (§2)
