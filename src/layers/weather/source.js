import { acceptRadarSnapshot } from './radar.js';

/** Request the current radar mosaic before it can replace the overlay. */
export function createWeatherSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  endpoint = '/api/weather-radar',
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(endpoint, {
        signal,
        cache: 'no-store',
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        /* status below remains authoritative */
      }
      signal?.throwIfAborted();
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const catalog = acceptRadarSnapshot(payload);
      if (!catalog) throw new Error('Malformed weather radar response');
      return catalog;
    },
  };
}
