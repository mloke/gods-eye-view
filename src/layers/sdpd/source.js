import { normalizeSdpdRecords, normalizeSdpdWindowDays } from './records.js';

function reportsUrl(endpoint, windowDays) {
  const separator = String(endpoint).includes('?') ? '&' : '?';
  return `${endpoint}${separator}days=${windowDays}`;
}

/** Request and validate a complete SDPD snapshot before it can replace displayed reports. */
export function createSdpdReportsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  endpoint = '/api/sdpd-reports',
} = {}) {
  let windowDays = normalizeSdpdWindowDays();
  return {
    setWindowDays(value) {
      windowDays = normalizeSdpdWindowDays(value);
      return windowDays;
    },
    getWindowDays() {
      return windowDays;
    },
    async getSnapshot({ signal, windowDays: days } = {}) {
      signal?.throwIfAborted();
      const window = normalizeSdpdWindowDays(days ?? windowDays);
      const response = await fetchImpl(reportsUrl(endpoint, window), {
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
      if (!response.ok) throw new Error(`SDPD HTTP ${response.status}`);
      const rows = normalizeSdpdRecords(payload);
      if (!rows) throw new Error('Malformed SDPD response');
      return rows;
    },
  };
}
