import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

interface NightModeProps {
  enabled: boolean;
  intensity?: number; // 0.0 - 1.0
}

export const NightModeOverlay: React.FC<NightModeProps> = ({ enabled, intensity = 0.6 }) => {
  return (
    <AnimatePresence>
      {enabled && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: intensity }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 pointer-events-none z-[150]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(80,0,0,0.3) 0%, rgba(40,0,0,0.6) 100%)',
            mixBlendMode: 'multiply',
          }}
        />
      )}
    </AnimatePresence>
  );
};

interface NightModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export const NightModeToggle: React.FC<NightModeToggleProps> = ({ enabled, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className={`glass-panel px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors ${
        enabled ? 'bg-red-500/20 border-red-500/50' : ''
      }`}
    >
      {enabled ? (
        <Eye className="w-3 h-3 text-red-400" />
      ) : (
        <EyeOff className="w-3 h-3 text-gray-400" />
      )}
      <span className={`text-[9px] font-bold ${enabled ? 'text-red-400' : 'text-gray-400'}`}>
        NIGHT {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  );
};
