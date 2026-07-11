import { ConstellationCatalog } from '../data/constellations';
import { DeepSpaceCatalog } from '../data/deepSpace';
import { CelestialEngine } from './celestialEngine';

interface Point {
  x: number;
  y: number;
}

interface Star {
  x: number;
  y: number;
  brightness: number;
}

export class PlateSolver {
  /**
   * Compute pixel distance between two points
   */
  private static pixelDist(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  /**
   * Compute angular distance between two catalog stars (in degrees)
   */
  private static angularDist(ra1: number, dec1: number, ra2: number, dec2: number): number {
    const toRad = Math.PI / 180;
    const dRa = (ra2 - ra1) * toRad;
    const dDec = (dec2 - dec1) * toRad;
    const a = Math.sin(dDec / 2) ** 2 + Math.cos(dec1 * toRad) * Math.cos(dec2 * toRad) * Math.sin(dRa / 2) ** 2;
    return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * (180 / Math.PI);
  }

  /**
   * Blob detection to extract star centers from a canvas
   */
  static extractStars(ctx: CanvasRenderingContext2D, width: number, height: number, threshold = 220): Star[] {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const stars: Star[] = [];
    const visited = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;

        if (brightness > threshold && !visited[y * width + x]) {
          stars.push({ x, y, brightness });
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (y+dy >= 0 && y+dy < height && x+dx >= 0 && x+dx < width) {
                visited[(y+dy) * width + (x+dx)] = 1;
              }
            }
          }
        }
      }
    }

    return stars.sort((a, b) => b.brightness - a.brightness).slice(0, 20);
  }

  /**
   * Matches extracted stars against known constellation patterns using
   * triangle-ratio matching: computes inter-star distance ratios from the image
   * and compares them to catalog angular-distance ratios.
   */
  static findConstellations(stars: Star[], fov: number = 60): string[] {
    if (stars.length < 3) return [];

    const detected: string[] = [];

    // Build triangles from the brightest detected stars
    const topStars = stars.slice(0, 8);
    const imageTris: number[] = [];
    for (let i = 0; i < topStars.length; i++) {
      for (let j = i + 1; j < topStars.length; j++) {
        imageTris.push(this.pixelDist(topStars[i], topStars[j]));
      }
    }
    if (imageTris.length === 0) return [];

    // Normalize image triangles by the largest distance
    const maxImgDist = Math.max(...imageTris);
    if (maxImgDist === 0) return [];
    const normImageTris = imageTris.map(d => d / maxImgDist);

    for (const constellation of ConstellationCatalog) {
      if (constellation.stars.length < 3) continue;

      // Build catalog triangles (angular distances)
      const catTris: number[] = [];
      const catStars = constellation.stars.slice(0, 8);
      for (let i = 0; i < catStars.length; i++) {
        for (let j = i + 1; j < catStars.length; j++) {
          catTris.push(this.angularDist(catStars[i].ra, catStars[i].dec, catStars[j].ra, catStars[j].dec));
        }
      }
      const maxCatDist = Math.max(...catTris);
      if (maxCatDist === 0) continue;
      const normCatTris = catTris.map(d => d / maxCatDist).sort((a, b) => a - b);

      // Sort image triangles for comparison
      const sortedImg = [...normImageTris].sort((a, b) => a - b);

      // Match: count how many normalized ratios are within tolerance
      let matchCount = 0;
      const tolerance = 0.15;
      let catIdx = 0;
      for (let imgIdx = 0; imgIdx < sortedImg.length && catIdx < normCatTris.length; imgIdx++) {
        while (catIdx < normCatTris.length && normCatTris[catIdx] < sortedImg[imgIdx] - tolerance) catIdx++;
        if (catIdx < normCatTris.length && Math.abs(normCatTris[catIdx] - sortedImg[imgIdx]) <= tolerance) {
          matchCount++;
          catIdx++;
        }
      }

      // Require at least 40% of the catalog triangles to match
      const matchRatio = matchCount / normCatTris.length;
      if (matchRatio >= 0.4) {
        detected.push(constellation.name);
      }
    }

    return detected;
  }

  /**
   * Parses a DSO catalog entry's sexagesimal RA/Dec strings ("00h 42m" / "+41° 16'")
   * into decimal hours (RA) and decimal degrees (Dec).
   */
  private static parseDSOCoords(ra: string, dec: string): { raHours: number; decDeg: number } | null {
    const raMatch = ra.match(/(\d+)h\s*(\d+)m/);
    const decMatch = dec.match(/([+-]?\d+)°\s*(\d+)/);
    if (!raMatch || !decMatch) return null;

    const raHours = parseInt(raMatch[1], 10) + parseInt(raMatch[2], 10) / 60;
    const decSign = decMatch[1].startsWith('-') ? -1 : 1;
    const decDeg = decSign * (Math.abs(parseInt(decMatch[1], 10)) + parseInt(decMatch[2], 10) / 60);

    return { raHours, decDeg };
  }

  /**
   * Identifies Deep Space Objects (Messier/NGC) actually present in frame by projecting
   * each catalog object's real RA/Dec to an expected screen position (same alt/az + FOV
   * transform used for guided star alignment) and checking whether a detected star
   * cluster centroid falls within a small pixel radius of that projected position.
   * Unlike a naive star-count heuristic, this only reports objects whose predicted
   * location actually lines up with something bright detected in the image.
   */
  static findDSOs(
    stars: Star[],
    opts: {
      lat: number;
      lng: number;
      date: Date;
      phoneAz: number;
      phoneAlt: number;
      fovX: number;
      fovY: number;
      width: number;
      height: number;
      matchRadiusPx?: number;
    }
  ): string[] {
    if (stars.length === 0) return [];

    const { lat, lng, date, phoneAz, phoneAlt, fovX, fovY, width, height } = opts;
    const matchRadiusPx = opts.matchRadiusPx ?? Math.max(width, height) * 0.05;
    const found: string[] = [];

    for (const dso of DeepSpaceCatalog) {
      const parsed = this.parseDSOCoords(dso.ra, dso.dec);
      if (!parsed) continue;

      const { alt, az } = CelestialEngine.toHorizontal({ ra: parsed.raHours, dec: parsed.decDeg }, lat, lng, date);

      let azDiff = az - phoneAz;
      while (azDiff > 180) azDiff -= 360;
      while (azDiff < -180) azDiff += 360;
      const altDiff = alt - phoneAlt;

      // Must actually be within the camera's field of view.
      if (Math.abs(azDiff) >= fovX / 2 || Math.abs(altDiff) >= fovY / 2) continue;

      const projX = (width / 2) + (azDiff / (fovX / 2)) * (width / 2);
      const projY = (height / 2) - (altDiff / (fovY / 2)) * (height / 2);

      // Confirm only if a detected star/cluster is actually near the projected position.
      const hasNearbyDetection = stars.some(s => Math.hypot(s.x - projX, s.y - projY) < matchRadiusPx);
      if (hasNearbyDetection) {
        found.push(`${dso.id} (${dso.name})`);
      }
    }

    return found.slice(0, 5);
  }
}
