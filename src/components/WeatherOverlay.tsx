import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cloud, Droplets, Wind, Eye, Thermometer, ChevronUp, ChevronDown } from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface WeatherData {
  temperature: number;
  humidity: number;
  cloudCover: number;
  visibility: number;
  windSpeed: number;
  seeingScore: number;
  seeingLabel: string;
}

interface WeatherOverlayProps {
  location: { lat: number; lng: number } | null;
}

export const WeatherOverlay: React.FC<WeatherOverlayProps> = ({ location }) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!location) return;

    let cancelled = false;
    const fetchWeather = async () => {
      setLoading(true);
      try {
        const data = await apiClient.getWeather(location.lat, location.lng);
        if (!cancelled) setWeather(data);
      } catch (err) {
        console.error('Weather fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 5 * 60 * 1000); // Refresh every 5 min

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [location?.lat, location?.lng]);

  if (!weather && !loading) return null;

  const getSeeingColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <motion.div
      layout
      className="glass-panel rounded-lg overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Compact header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-1.5 flex items-center gap-2"
      >
        {loading ? (
          <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Cloud className={`w-3 h-3 ${weather && weather.cloudCover > 50 ? 'text-gray-400' : 'text-emerald-500'}`} />
        )}
        <span className={`text-[9px] font-bold ${weather ? getSeeingColor(weather.seeingScore) : 'text-gray-400'}`}>
          {weather ? `SEEING: ${weather.seeingLabel.toUpperCase()} (${weather.seeingScore}%)` : 'LOADING...'}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3 text-gray-400 ml-auto" /> : <ChevronDown className="w-3 h-3 text-gray-400 ml-auto" />}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && weather && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-3 pb-2 space-y-1.5 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1.5">
                <Thermometer className="w-2.5 h-2.5 text-orange-400" />
                <span className="text-[8px] text-gray-300">{weather.temperature}°C</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Droplets className="w-2.5 h-2.5 text-blue-400" />
                <span className="text-[8px] text-gray-300">{weather.humidity}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Cloud className="w-2.5 h-2.5 text-gray-400" />
                <span className="text-[8px] text-gray-300">{weather.cloudCover}% cloud</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wind className="w-2.5 h-2.5 text-cyan-400" />
                <span className="text-[8px] text-gray-300">{weather.windSpeed} km/h</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <Eye className="w-2.5 h-2.5 text-emerald-400" />
                <span className="text-[8px] text-gray-300">Vis: {(weather.visibility / 1000).toFixed(1)} km</span>
              </div>
            </div>
            {/* Seeing bar */}
            <div className="mt-1">
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${weather.seeingScore}%` }}
                  className={`h-full rounded-full ${
                    weather.seeingScore >= 80 ? 'bg-emerald-500' :
                    weather.seeingScore >= 60 ? 'bg-yellow-500' :
                    weather.seeingScore >= 40 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
