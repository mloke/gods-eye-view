import exampleFences from '../../../config/geofences.example.json' with { type: 'json' };
import { normalizeGeofences } from './records.js';

/** Read personal watch zones from the ignored local file, then the committed template. */
export function createGeofenceWatchSource({
  payload,
  fetchImpl = (...args) => globalThis.fetch(...args),
  endpoint = '/api/geofences',
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      let raw = payload;
      if (raw === undefined && typeof fetchImpl === 'function') {
        try {
          const response = await fetchImpl(endpoint, {
            signal,
            cache: 'no-store',
          });
          if (response?.ok) raw = await response.json();
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
        }
      }
      const rows = normalizeGeofences(raw ?? exampleFences);
      if (!rows) throw new Error('Malformed geofences file');
      return rows;
    },
  };
}
