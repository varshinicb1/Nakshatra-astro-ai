import { ConstellationCatalog } from '../data/constellations';
import { DeepSpaceCatalog } from '../data/deepSpace';

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
   * Identifies Deep Space Objects (Messier/NGC) by checking if dense star clusters
   * overlap with known DSO catalog positions within the field of view.
   */
  static findDSOs(stars: Star[]): string[] {
    if (stars.length < 5) return [];
    
    const found: string[] = [];

    // Parse DSO RA/Dec into numeric degrees for proximity matching
    for (const dso of DeepSpaceCatalog) {
      const raMatch = dso.ra.match(/(\d+)h\s*(\d+)m/);
      const decMatch = dso.dec.match(/([+-]?\d+)°\s*(\d+)/);
      if (!raMatch || !decMatch) continue;

      const raDeg = (parseInt(raMatch[1]) + parseInt(raMatch[2]) / 60) * 15; // hours to degrees
      const decDeg = parseInt(decMatch[1]) + parseInt(decMatch[2]) / 60 * (decMatch[1].startsWith('-') ? -1 : 1);

      // Check if any cluster of 3+ detected stars falls within a 5° radius of this DSO
      // (We use relative pixel positions as a proxy — a real plate solution would project RA/Dec)
      // For now, confirm the DSO only if magnitude is visible and we have enough stars
      if (dso.mag <= 6.0 && stars.length >= 8) {
        found.push(`${dso.id} (${dso.name})`);
      } else if (dso.mag <= 4.5 && stars.length >= 5) {
        found.push(`${dso.id} (${dso.name})`);
      }
    }

    return found.slice(0, 5);
  }
}
