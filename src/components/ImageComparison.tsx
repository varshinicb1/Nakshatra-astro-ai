import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface ImageComparisonProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
  onClose: () => void;
}

export const ImageComparison: React.FC<ImageComparisonProps> = ({
  beforeImage,
  afterImage,
  beforeLabel = 'Single Frame',
  afterLabel = 'Stacked Result',
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  }, [handleMove]);

  const handleMouseDown = useCallback(() => setIsDragging(true), []);
  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  }, [isDragging, handleMove]);

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-black text-white uppercase tracking-widest">Astro Comparison</h2>
        <button onClick={onClose} className="p-2 bg-white/5 text-gray-400 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 rounded-2xl overflow-hidden cursor-col-resize select-none border border-white/10"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onTouchStart={(e) => {
        if (e.touches.length > 0) handleMove(e.touches[0].clientX);
      }}
    >
      {/* After image (full width, underneath) */}
      <img
        src={afterImage}
        alt={afterLabel}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeImage}
          alt={beforeLabel}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ width: containerRef.current?.offsetWidth || '100%' }}
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 z-10"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-0.5 h-full bg-white shadow-lg shadow-black/50" />
        {/* Handle */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center"
          whileTap={{ scale: 0.9 }}
        >
          <div className="flex gap-0.5">
            <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
            <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
          </div>
        </motion.div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-20">
        <span className="text-[8px] font-black uppercase tracking-widest bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-gray-300">
          {beforeLabel}
        </span>
      </div>
      <div className="absolute top-3 right-3 z-20">
        <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-500/20 backdrop-blur-sm px-2 py-1 rounded text-emerald-400 border border-emerald-500/30">
          {afterLabel}
        </span>
      </div>
    </div>
  </div>
);
};
