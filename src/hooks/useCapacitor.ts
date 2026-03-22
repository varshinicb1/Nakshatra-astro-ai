import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { useState, useCallback, useEffect } from 'react';

export const useCapacitor = () => {
  const isNative = Capacitor.isNativePlatform();

  const vibrate = useCallback(async (style: ImpactStyle = ImpactStyle.Medium) => {
    if (isNative) {
      await Haptics.impact({ style });
    } else if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, [isNative]);

  const getCurrentPosition = useCallback(async () => {
    if (isNative) {
      try {
        const coordinates = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 5000
        });
        return {
          lat: coordinates.coords.latitude,
          lng: coordinates.coords.longitude
        };
      } catch (err) {
        console.error('Native location error:', err);
        return null;
      }
    } else {
      return new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000 }
        );
      });
    }
  }, [isNative]);

  const takePicture = useCallback(async () => {
    if (isNative) {
      try {
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera
        });
        return image.base64String ? `data:image/jpeg;base64,${image.base64String}` : null;
      } catch (err) {
        console.error('Native camera error:', err);
        return null;
      }
    }
    // Web fallback: capture from active video stream
    try {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (video && video.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          return canvas.toDataURL('image/jpeg', 0.90);
        }
      }
    } catch (err) {
      console.error('Web capture fallback error:', err);
    }
    return null;
  }, [isNative]);

  const shareContent = useCallback(async (title: string, text: string, url?: string, files?: string[]) => {
    if (isNative) {
      await Share.share({
        title,
        text,
        url,
        files
      });
    } else if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        console.error('Web share error:', err);
      }
    } else {
      // Fallback: Copy to clipboard
      const shareUrl = url || window.location.href;
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
    }
  }, [isNative]);

  return {
    isNative,
    vibrate,
    getCurrentPosition,
    takePicture,
    shareContent
  };
};
