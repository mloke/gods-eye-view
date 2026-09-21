import exampleTags from '../../../config/location-tags.example.json' with { type: 'json' };
import { normalizeLocationTags } from './records.js';

/** Read personal tags from the ignored local file, then the committed template. */
export function createLocationTagsSource({
  payload,
  fetchImpl = (...args) => globalThis.fetch(...args),
  endpoint = '/api/location-tags',
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
      const rows = normalizeLocationTags(raw ?? exampleTags);
      if (!rows) throw new Error('Malformed location tags file');
      return rows;
    },
  };
}
