/// <reference types="vite/client" />
// On Android, 'localhost' refers to the device itself.
// Use VITE_API_URL in .env to point to your development machine's IP (e.g., http://192.168.1.5:3001)
const API_BASE = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/api');
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN || 'nakshatra-secure-token-2026';

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: any;
  timeout?: number;
}

class ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, timeout = 60000 } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'X-App-Token': this.token,
      };

      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async healthCheck(): Promise<{ status: string; timestamp: number; version: string }> {
    return this.request('/api/health');
  }

  async analyzeImage(
    image: string,
    location: { lat: number; lng: number },
    orientation: { alpha: number; beta: number; gamma: number },
    identifiedConstellations: string[] = []
  ): Promise<any> {
    return this.request('/api/analyze', {
      method: 'POST',
      body: { image, location, orientation, identifiedConstellations },
      timeout: 90000, // AI analysis can take longer
    });
  }

  async getWeather(lat: number, lng: number): Promise<any> {
    return this.request(`/api/weather?lat=${lat}&lng=${lng}`);
  }

  async getISSPosition(): Promise<{ latitude: number; longitude: number; timestamp: number }> {
    return this.request('/api/iss');
  }

  async getAPOD(): Promise<any> {
    return this.request('/api/apod');
  }
}

export const apiClient = new ApiClient(API_BASE, APP_TOKEN);
