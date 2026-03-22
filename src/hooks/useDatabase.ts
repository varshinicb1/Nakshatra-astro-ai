import { useState, useEffect, useCallback, useRef } from 'react';

const DB_NAME = 'nakshatra_db';
const DB_VERSION = 1;
const STORE_NAME = 'gallery';

export interface GalleryItem {
  id: string;
  image: string;
  thumbnail: string;
  analysis: any;
  timestamp: number;
  location: { lat: number; lng: number };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateThumbnail(base64Image: string, maxSize: number = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      } else {
        resolve(base64Image);
      }
    };
    img.onerror = () => resolve(base64Image);
    img.src = base64Image;
  });
}

export function useDatabase() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const dbRef = useRef<IDBDatabase | null>(null);

  // Initialize DB and migrate from localStorage
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const db = await openDB();
        dbRef.current = db;

        // Migrate from localStorage if data exists there
        const oldData = localStorage.getItem('nakshatra_gallery');
        if (oldData) {
          try {
            const oldItems = JSON.parse(oldData) as any[];
            if (oldItems.length > 0) {
              const tx = db.transaction(STORE_NAME, 'readwrite');
              const store = tx.objectStore(STORE_NAME);

              for (const item of oldItems) {
                const thumbnail = await generateThumbnail(item.image);
                store.put({ ...item, thumbnail });
              }

              await new Promise<void>((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
              });

              localStorage.removeItem('nakshatra_gallery');
              console.log(`Migrated ${oldItems.length} items from localStorage to IndexedDB`);
            }
          } catch (e) {
            console.error('Migration failed:', e);
          }
        }

        // Load all items
        const allItems = await getAllItems(db);
        if (!cancelled) {
          setItems(allItems);
          setLoading(false);
        }
      } catch (err) {
        console.error('Database init failed:', err);
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  const getAllItems = async (db: IDBDatabase): Promise<GalleryItem[]> => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Newest first
      const results: GalleryItem[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  };

  const addItem = useCallback(async (item: Omit<GalleryItem, 'thumbnail'>): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;

    try {
      const thumbnail = await generateThumbnail(item.image);
      const fullItem: GalleryItem = { ...item, thumbnail };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(fullItem);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      setItems(prev => [fullItem, ...prev]);
    } catch (err) {
      console.error('Failed to save to gallery:', err);
      throw err;
    }
  }, []);

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      setItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error('Failed to delete from gallery:', err);
      throw err;
    }
  }, []);

  const clearAll = useCallback(async (): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      setItems([]);
    } catch (err) {
      console.error('Failed to clear gallery:', err);
      throw err;
    }
  }, []);

  const getItemCount = useCallback(() => items.length, [items]);

  return {
    items,
    loading,
    addItem,
    deleteItem,
    clearAll,
    getItemCount,
  };
}
