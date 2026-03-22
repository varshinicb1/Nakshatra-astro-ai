import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { CelestialEngine } from '../utils/celestialEngine';

interface SkyObject {
  name: string;
  type: string;
  magnitude: string;
  ra?: number; // Right Ascension in degrees
  dec?: number; // Declination in degrees
}

interface SkyMapProps {
  orientation: { alpha: number; beta: number; gamma: number };
  location: { lat: number; lng: number } | null;
  analysis: {
    constellations: string[];
    objects: Array<{ name: string; type: string; magnitude: string }>;
  } | null;
}

// Major Stars Data
const MAJOR_STARS = [
  { name: 'Sirius', ra: 101.28, dec: -16.71, mag: -1.46 },
  { name: 'Canopus', ra: 95.98, dec: -52.69, mag: -0.74 },
  { name: 'Arcturus', ra: 213.91, dec: 19.18, mag: -0.05 },
  { name: 'Vega', ra: 279.23, dec: 38.78, mag: 0.03 },
  { name: 'Capella', ra: 79.17, dec: 45.99, mag: 0.08 },
  { name: 'Rigel', ra: 78.63, dec: -8.20, mag: 0.13 },
  { name: 'Procyon', ra: 114.82, dec: 5.22, mag: 0.34 },
  { name: 'Betelgeuse', ra: 88.79, dec: 7.41, mag: 0.42 },
  { name: 'Altair', ra: 297.69, dec: 8.86, mag: 0.76 },
  { name: 'Aldebaran', ra: 68.98, dec: 16.51, mag: 0.85 },
  { name: 'Antares', ra: 247.35, dec: -26.43, mag: 0.96 },
  { name: 'Spica', ra: 201.29, dec: -11.16, mag: 0.97 },
  { name: 'Pollux', ra: 116.32, dec: 28.02, mag: 1.14 },
  { name: 'Fomalhaut', ra: 344.41, dec: -29.62, mag: 1.16 },
  { name: 'Deneb', ra: 310.35, dec: 45.28, mag: 1.25 },
  { name: 'Regulus', ra: 152.09, dec: 11.96, mag: 1.35 },
];

// Constellation Lines (simplified)
const CONSTELLATIONS = [
  {
    name: 'Orion',
    lines: [
      [88.79, 7.41, 81.28, 6.35], // Betelgeuse to Bellatrix
      [81.28, 6.35, 83.00, -0.30], // Bellatrix to Mintaka
      [83.00, -0.30, 84.05, -1.20], // Mintaka to Alnilam
      [84.05, -1.20, 85.19, -1.94], // Alnilam to Alnitak
      [85.19, -1.94, 86.93, -9.67], // Alnitak to Saiph
      [86.93, -9.67, 78.63, -8.20], // Saiph to Rigel
      [78.63, -8.20, 83.00, -0.30], // Rigel to Mintaka
      [88.79, 7.41, 85.19, -1.94], // Betelgeuse to Alnitak
    ]
  },
  {
    name: 'Ursa Major',
    lines: [
      [165.93, 61.75, 165.46, 56.38], // Dubhe to Merak
      [165.46, 56.38, 178.46, 53.69], // Merak to Phecda
      [178.46, 53.69, 183.14, 57.03], // Phecda to Megrez
      [183.14, 57.03, 165.93, 61.75], // Megrez to Dubhe
      [183.14, 57.03, 193.10, 55.96], // Megrez to Alioth
      [193.10, 55.96, 200.98, 54.93], // Alioth to Mizar
      [200.98, 54.93, 206.88, 49.31], // Mizar to Alkaid
    ]
  }
];

interface Star {
  id: number;
  ra: number;
  dec: number;
  mag: number;
}

interface Constellation {
  name: string;
  lines: number[][];
}

// Simulated star field
const generateStars = (count: number): Star[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    ra: Math.random() * 360,
    dec: Math.random() * 180 - 90,
    mag: Math.random() * 5 + 1
  }));
};
export const SkyMap: React.FC<SkyMapProps> = ({ orientation, location, analysis }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredObject, setHoveredObject] = useState<any>(null);
  const [activeConstellation, setActiveConstellation] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const width = 400;
  const height = 400;
  const baseRadius = Math.min(width, height) / 2 - 20;
  const radius = baseRadius * zoom;

  // --- Stellarium Remix: High-Precision Coordinate Mapping ---
  const mapToHorizontal = (ra: number, dec: number) => {
    if (!location) return null;
    return CelestialEngine.toHorizontal({ ra: ra/15, dec }, location.lat, location.lng, currentTime);
  };

  const sunPos = useMemo(() => CelestialEngine.getSunPosition(currentTime), [currentTime]);
  const sunHorizontal = useMemo(() => location ? mapToHorizontal(sunPos.ra * 15, sunPos.dec) : null, [sunPos, location]);

  const stars = useMemo(() => generateStars(400), []);

  // Projection: Orthographic or Stereographic for sky view
  const projection = useMemo(() => {
    return d3.geoStereographic()
      .scale(radius * 2)
      .translate([width / 2 + offset.x, height / 2 + offset.y])
      .clipAngle(90)
      .rotate([-orientation.alpha, -orientation.beta, 0]);
  }, [orientation, radius, offset]);

  const pathGenerator = d3.geoPath().projection(projection);

  // Map analysis objects to simulated coordinates
  const identifiedObjects = useMemo(() => {
    if (!analysis) return [];
    return analysis.objects.map((obj) => ({
      ...obj,
      ra: (orientation.alpha + (Math.random() - 0.5) * 20) % 360,
      dec: (orientation.beta + (Math.random() - 0.5) * 20) % 90
    }));
  }, [analysis, orientation.alpha, orientation.beta]);

  // Generate grid lines
  const graticule = useMemo(() => {
    const lines: any[] = [];
    for (let d = 0; d < 360; d += 30) {
      lines.push({ type: 'LineString', coordinates: d3.range(-90, 91, 2).map(lat => [d, lat]), id: `meridian-${d}` });
    }
    for (let d = -60; d <= 60; d += 30) {
      lines.push({ type: 'LineString', coordinates: d3.range(0, 361, 5).map(lng => [lng, d]), id: `parallel-${d}` });
    }
    return lines;
  }, []);

  // Touch Handlers
  const lastTouchRef = useRef<{ x: number, y: number, dist: number } | null>(null);
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (lastTouchRef.current) {
        const dx = touch.clientX - lastTouchRef.current.x;
        const dy = touch.clientY - lastTouchRef.current.y;
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      }
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY, dist: 0 };
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (lastTouchRef.current && lastTouchRef.current.dist > 0) {
        const delta = dist / lastTouchRef.current.dist;
        setZoom(prev => Math.max(0.5, Math.min(5, prev * delta)));
      }
      lastTouchRef.current = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2, dist };
    }
  };

  const handleTouchEnd = () => {
    lastTouchRef.current = null;
  };

  return (
    <div 
      className="relative w-full h-full flex items-center justify-center touch-none"
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={(e) => setZoom(prev => Math.max(0.5, Math.min(5, prev - e.deltaY * 0.001)))}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible cursor-move"
      >
        {/* Background Circle */}
        <circle
          cx={width / 2}
          cy={height / 2}
          r={baseRadius}
           fill="rgba(10, 20, 30, 0.4)"
          stroke="rgba(63, 185, 80, 0.2)"
          strokeWidth="1"
        />

        {/* Grid Lines */}
        <g className="grid-lines">
          {graticule.map(line => (
            <path
              key={line.id}
              d={pathGenerator(line) || ''}
              fill="none"
              stroke="rgba(255, 255, 255, 0.05)"
              strokeWidth="0.5"
            />
          ))}
        </g>

        {/* Constellation Lines */}
        <g className="constellations">
          {CONSTELLATIONS.map((constellation: Constellation) => {
            const isActive = activeConstellation === constellation.name;
            return (
              <g 
                key={constellation.name} 
                className="group cursor-pointer"
                onMouseEnter={() => setActiveConstellation(constellation.name)}
                onMouseLeave={() => setActiveConstellation(null)}
                onClick={() => setActiveConstellation(prev => prev === constellation.name ? null : constellation.name)}
              >
                {constellation.lines.map((line, i) => {
                  const d = pathGenerator({
                    type: 'LineString',
                    coordinates: [[line[0], line[1]], [line[2], line[3]]]
                  } as any);
                  if (!d) return null;
                  return (
                    <path
                      key={`${constellation.name}-line-${i}`}
                      d={d}
                      fill="none"
                      stroke={isActive ? "rgba(16, 185, 129, 0.8)" : "rgba(63, 185, 80, 0.2)"}
                      strokeWidth={isActive ? "2" : "1"}
                      className="transition-all duration-300 group-hover:stroke-emerald-400/50"
                    />
                  );
                })}
                {/* Constellation Label */}
                {(() => {
                  const centerRA = d3.mean(constellation.lines.flatMap(l => [l[0], l[2]])) || 0;
                  const centerDec = d3.mean(constellation.lines.flatMap(l => [l[1], l[3]])) || 0;
                  const pos = projection([centerRA, centerDec]);
                  if (!pos) return null;
                  const dx = pos[0] - width / 2;
                  const dy = pos[1] - height / 2;
                  if (Math.sqrt(dx * dx + dy * dy) > baseRadius) return null;

                  return (
                    <text
                      x={pos[0]}
                      y={pos[1]}
                      fill={isActive ? "rgba(16, 185, 129, 1)" : "rgba(63, 185, 80, 0.4)"}
                      fontSize={isActive ? "12" : "8"}
                      textAnchor="middle"
                      className="uppercase tracking-widest font-black transition-all duration-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    >
                      {constellation.name}
                    </text>
                  );
                })()}
              </g>
            );
          })}
        </g>

        {/* Stars */}
        <g className="stars">
          {stars.map((star: Star) => {
            const pos = projection([star.ra, star.dec]);
            if (!pos) return null;
            
            const dx = pos[0] - width / 2;
            const dy = pos[1] - height / 2;
            if (Math.sqrt(dx * dx + dy * dy) > baseRadius) return null;

            return (
              <circle
                key={star.id}
                cx={pos[0]}
                cy={pos[1]}
                r={Math.max(0.5, (3 - star.mag / 2) * (zoom < 1 ? 1 : 1 / Math.sqrt(zoom)))}
                fill="white"
                opacity={Math.max(0.1, 0.8 - star.mag / 6)}
              />
            );
          })}
        </g>

        {/* Major Named Stars */}
        <g className="major-stars">
          {MAJOR_STARS.map(star => {
            const pos = projection([star.ra, star.dec]);
            if (!pos) return null;

            const dx = pos[0] - width / 2;
            const dy = pos[1] - height / 2;
            if (Math.sqrt(dx * dx + dy * dy) > baseRadius) return null;

            return (
              <g 
                key={star.name} 
                className="cursor-pointer"
                onMouseEnter={() => setHoveredObject({ ...star, type: 'Star' })}
                onMouseLeave={() => setHoveredObject(null)}
                onClick={() => setHoveredObject({ ...star, type: 'Star' })}
              >
                <circle
                  cx={pos[0]}
                  cy={pos[1]}
                  r={4}
                  fill="white"
                  className="animate-pulse"
                />
                <circle
                  cx={pos[0]}
                  cy={pos[1]}
                  r={8}
                  fill="transparent"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1"
                />
                <text
                  x={pos[0] + 8}
                  y={pos[1] + 4}
                  fill="rgba(255,255,255,0.6)"
                  fontSize="8"
                  className="pointer-events-none font-medium"
                >
                  {star.name}
                </text>
              </g>
            );
          })}
        </g>

        {/* Identified Objects */}
        <g className="identified">
          {identifiedObjects.map((obj, i) => {
            const pos = projection([obj.ra, obj.dec]);
            if (!pos) return null;

            const dx = pos[0] - width / 2;
            const dy = pos[1] - height / 2;
            if (Math.sqrt(dx * dx + dy * dy) > baseRadius) return null;

            return (
              <g 
                key={`obj-${i}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredObject(obj)}
                onMouseLeave={() => setHoveredObject(null)}
              >
                <motion.circle
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  cx={pos[0]}
                  cy={pos[1]}
                  r={6}
                  fill="none"
                  stroke="#3fb950"
                  strokeWidth="1.5"
                  className="animate-pulse"
                />
                <text
                  x={pos[0] + 10}
                  y={pos[1] - 10}
                  fill="#3fb950"
                  fontSize="10"
                  fontWeight="bold"
                  className="pointer-events-none"
                >
                  {obj.name}
                </text>
              </g>
            );
          })}
        </g>

        {/* Compass Cardinal Points */}
        <g className="cardinal-points" fontSize="10" fontWeight="bold" fill="rgba(255,255,255,0.3)">
          {['N', 'E', 'S', 'W'].map((label, i) => {
            const angle = (i * 90);
            const pos = projection([angle, 0]);
            if (!pos) return null;
            return (
              <text key={label} x={pos[0]} y={pos[1]} textAnchor="middle" alignmentBaseline="middle">
                {label}
              </text>
            );
          })}
        </g>
      </svg>

      {/* Zoom Controls */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-2">
        <button onClick={() => setZoom(z => Math.min(5, z * 1.2))} className="w-8 h-8 bg-white/10 rounded flex items-center justify-center text-white font-bold">+</button>
        <button onClick={() => setZoom(z => Math.max(0.5, z / 1.2))} className="w-8 h-8 bg-white/10 rounded flex items-center justify-center text-white font-bold">-</button>
        <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="w-8 h-8 bg-white/10 rounded flex items-center justify-center text-[8px] text-white font-bold">RST</button>
      </div>

      {/* Hover Info Tooltip */}
      <AnimatePresence>
        {hoveredObject && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-4 right-4 glass-panel p-3 rounded-xl border border-emerald-500/30 pointer-events-none"
          >
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-white font-bold text-sm uppercase tracking-tighter">{hoveredObject.name}</h4>
                <p className="text-[10px] text-emerald-500 font-medium uppercase">{hoveredObject.type || 'Celestial Object'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase">Magnitude</p>
                <p className="text-white font-bold text-sm">{hoveredObject.mag || hoveredObject.magnitude}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Reticle */}
      <div className="absolute w-4 h-4 border border-emerald-500/50 rounded-full pointer-events-none" />
    </div>
  );
};
