import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Calendar, MapPin, Star, Info, X, Share2 } from 'lucide-react';
import type { GalleryItem } from '../hooks/useDatabase';

import { useCapacitor } from '../hooks/useCapacitor';
import { ImpactStyle } from '@capacitor/haptics';

interface GalleryProps {
  items: GalleryItem[];
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const Gallery: React.FC<GalleryProps> = ({ items, onDelete, onClose }) => {
  const [selectedItem, setSelectedItem] = React.useState<GalleryItem | null>(null);
  const { isNative, vibrate, shareContent } = useCapacitor();

  const handleShare = async (item: GalleryItem) => {
    try {
      if (isNative) {
        // Native share using base64 file data or link
        await shareContent(
          'Nakshatra Celestial Capture',
          `Check out this capture of ${item.analysis?.constellations?.[0] || 'the night sky'}!`,
          undefined,
          [item.image] // Share base64 directly or path
        );
        return;
      }
      const blob = await (await fetch(item.image)).blob();
      const file = new File([blob], `nakshatra_${item.id}.jpg`, { type: 'image/jpeg' });
      if (navigator.share) {
        await navigator.share({
          title: 'Nakshatra Celestial Capture',
          text: `Check out this capture of ${item.analysis?.constellations?.[0] || 'the night sky'}!`,
          files: [file],
        });
      } else {
        // Fallback: download the image
        const link = document.createElement('a');
        link.href = item.image;
        link.download = `nakshatra_${item.id}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  };

  const handleDelete = (id: string) => {
    vibrate(ImpactStyle.Medium);
    if (confirm('Delete this capture? This cannot be undone.')) {
      onDelete(id);
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    }
  };

  return (
    <div className="absolute inset-0 bg-black/95 z-50 flex flex-col p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Astrophotography</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">
            {items.length} Capture{items.length !== 1 ? 's' : ''} • Your Private Collection
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-3 glass-panel rounded-full text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
          <div className="w-20 h-20 border border-dashed border-white/20 rounded-full flex items-center justify-center mb-4">
            <Star className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-sm text-gray-400 uppercase tracking-widest">No Captures Yet</p>
          <p className="text-[10px] text-gray-600 mt-2">Start observing to build your gallery</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            {items.map((item) => (
              <motion.div
                layoutId={item.id}
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 bg-white/5 cursor-pointer"
              >
                <img
                  src={item.thumbnail || item.image}
                  alt="Celestial Capture"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <p className="text-[10px] font-bold text-white truncate">
                    {item.analysis?.constellations?.[0] || 'Unknown Region'}
                  </p>
                  <p className="text-[8px] text-gray-400">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </p>
                </div>
                {/* Always-visible bottom label on mobile */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 group-hover:opacity-0 transition-opacity">
                  <p className="text-[8px] font-bold text-white/80 truncate">
                    {item.analysis?.constellations?.[0] || 'Night Sky'}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Overlay */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/98 z-[60] flex flex-col p-6 overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleShare(selectedItem)}
                  className="p-2 text-emerald-500 hover:text-emerald-400"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDelete(selectedItem.id)}
                  className="p-2 text-red-500 hover:text-red-400"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="rounded-3xl overflow-hidden border border-white/10 mb-6 aspect-video">
              <img
                src={selectedItem.image}
                alt="Detail"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter">
                    {selectedItem.analysis?.constellations?.[0] || 'Deep Space'}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
                      <Calendar className="w-3 h-3" />
                      {new Date(selectedItem.timestamp).toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
                      <MapPin className="w-3 h-3" />
                      {selectedItem.location?.lat?.toFixed(2)}, {selectedItem.location?.lng?.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {selectedItem.analysis?.objects && (
                <div className="grid grid-cols-2 gap-2">
                  {selectedItem.analysis.objects.map((obj: any, i: number) => (
                    <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <p className="text-[10px] font-bold text-white">{obj.name}</p>
                      <p className="text-[8px] text-gray-500 uppercase">{obj.type} • Mag {obj.magnitude}</p>
                      {obj.spectral_type && <p className="text-[7px] text-emerald-500/80 mt-1">Spectral: {obj.spectral_type}</p>}
                      {obj.distance && <p className="text-[7px] text-purple-400/80 mt-1">Dist: {obj.distance}</p>}
                      {obj.catalog_id && <p className="text-[7px] text-yellow-400/80 mt-1">{obj.catalog_id}</p>}
                    </div>
                  ))}
                </div>
              )}

              {selectedItem.analysis?.analysis && (
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <h4 className="text-[10px] text-gray-500 uppercase mb-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Analysis Report
                  </h4>
                  <p className="text-[11px] text-gray-300 leading-relaxed italic">
                    "{selectedItem.analysis.analysis}"
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
