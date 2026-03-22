<div align="center">
  <h1>Nakshatra Astro-AI</h1>
  <p><strong>Official v14 Release</strong></p>
  <p><em>Made by Varshini CB</em></p>
</div>

---

### The Story Behind Nakshatra Astro-AI

I've always been fascinated by the glowing stars in the night sky. Especially in places like Tumkur — on clear nights, you can actually see a decent number of stars. It’s obviously nothing compared to high-altitude or rural skies, but it’s still far better than Bangalore, where the night sky often looks orange due to heavy light pollution.

Growing up, I always wanted to capture the moon and stars — not just see them, but actually bring them onto a screen. Capturing the moon is easy. But stars? On most smartphones, they either appear as tiny dots (if you're lucky) or the image turns out completely black in normal camera mode.

That’s where I paused and rethought everything.

A camera isn’t just for aesthetic photography — it’s a powerful optical sensor. It captures photons, integrates light over time, and encodes real physical data from the environment. If used correctly, it can detect signals far beyond what the human eye can perceive in real time.

So I started experimenting:
- Long exposure techniques
- Burst capture
- Manual stacking
- Python-based processing pipelines

After a lot of trial and error, I realized something: why not turn this into an app — so people like me can experience this?

That’s how this evolved.

Below is the current state of the system — a serious computational astrophotography tool.

---

### Features (v14 State)

Here is the honest, no-fluff list of exactly what the Nakshatra Astro-AI app currently does in its v14 state:

**1. Authentic Sensor-Gated Intervalometer (Burst Capture)**
Instead of taking a single picture or faking exposure using video loops, the app behaves like a true intervalometer. The user sets exposure time and burst count. During each exposure window, the app continuously monitors gyroscope and accelerometer data at ~50ms intervals. If motion exceeds a threshold, the frame is rejected instantly. Only stable frames are accepted. It then uses the hardware-level ImageCapture API (where supported) to capture real, uncompressed frames.

**2. Stellarium-Prior Guided Alignment**
Due to Earth's rotation (~15 arcseconds/sec), stars drift across the sensor. The app compensates using sensor fusion (GPS, compass, tilt). It predicts expected star positions using a mathematical star catalog. It then performs peak detection to find actual star centroids in each frame, computes sub-pixel geometric transformations (translation + rotation), and aligns all frames precisely before stacking.

**3. Mathematical Image Stacking (Sigma Clipping)**
Instead of naive averaging, the app uses sigma clipping. For each pixel stack, it computes mean and standard deviation, rejects outliers, and retains only consistent signal. This removes satellite streaks, aircraft trails, and sensor noise, preserving real astronomical data.

**4. Dark, Flat, and Bias Calibration**
The app supports calibration frames:
- **Dark Frames:** remove thermal noise
- **Flat Frames:** correct vignetting and dust artifacts
- **Bias Frames:** remove baseline readout noise

All corrections are applied locally before stacking.

**5. Live Meteor Pulse Detection**
During capture, the app scans incoming pixel data for sudden intensity spikes. It verifies spatial coherence (neighboring pixel activation) to avoid false positives. On detection, it triggers a haptic alert so the user can look up in real time.

**6. Deep Sky Identification Engine (On-device + Model-assisted)**
The app analyzes the final processed image along with metadata (GPS, orientation, ISO, exposure, local sky conditions). It identifies constellations, bright stars, and potential deep-sky objects using geometric matching and probabilistic inference.

**7. Observational Astronomy Dashboard**
Provides real-time calculations:
- Moon phase and illumination
- Active meteor showers
- Estimated Bortle scale (light pollution level based on location)

**8. Immersive "Red Shift" Field UI**
The UI is designed for field use:
- Fullscreen immersive mode
- Red-only display to preserve night vision
- Auto-fading HUD elements after inactivity

---

### Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Run the application locally:
   `npm run dev`
