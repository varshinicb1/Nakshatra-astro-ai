// --- Lightweight Constellation Catalog for Plate Solving ---
// Format: { name: string, stars: { raDelta: number, decDelta: number, mag: number }[] }
// Positions are relative to the 'anchor' star of the constellation.

export const ConstellationCatalog = [
  {
    name: "Ursa Major",
    abbr: "UMa",
    stars: [
      { ra: 165.93, dec: 61.75, mag: 1.8 }, // Dubhe
      { ra: 165.46, dec: 56.38, mag: 2.3 }, // Merak
      { ra: 178.46, dec: 54.71, mag: 2.4 }, // Phecda
      { ra: 183.04, dec: 57.03, mag: 3.3 }, // Megrez
      { ra: 193.31, dec: 55.96, mag: 1.8 }, // Alioth
      { ra: 201.30, dec: 54.93, mag: 2.1 }, // Mizar
      { ra: 210.16, dec: 49.31, mag: 1.9 }  // Alkaid
    ]
  },
  {
    name: "Orion",
    abbr: "Ori",
    stars: [
      { ra: 88.79, dec: 7.41, mag: 0.4 },  // Betelgeuse
      { ra: 78.63, dec: 8.20, mag: 1.6 },  // Bellatrix
      { ra: 83.00, dec: -0.30, mag: 2.2 }, // Alnilam
      { ra: 77.19, dec: -8.20, mag: 0.1 }, // Rigel
      { ra: 86.94, dec: -9.67, mag: 2.0 }  // Saiph
    ]
  },
  {
    name: "Cassiopeia",
    abbr: "Cas",
    stars: [
      { ra: 9.17, dec: 59.15, mag: 2.2 },  // Schedar
      { ra: 1.63, dec: 59.15, mag: 2.3 },  // Caph
      { ra: 14.18, dec: 60.72, mag: 2.1 }, // Gamma Cas
      { ra: 21.28, dec: 60.23, mag: 2.7 }, // Ruchbah
      { ra: 28.59, dec: 63.67, mag: 3.4 }  // Segin
    ]
  }
  // ... many more would be added in production
];
