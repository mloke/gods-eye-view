import {
  coalesceProxyRequest,
  readResponseTextCapped,
} from '../common/http.js';
import {
  RAINVIEWER_MAPS_URL,
  normalizeRadarCatalog,
} from '../../../src/layers/weather/radar.js';

const RADAR_CACHE_MS = 2 * 60_000;
const RADAR_STALE_MS = 20 * 60_000;
const RADAR_MAX_BYTES = 256 * 1024;

/** Proxy the RainViewer radar catalog. Tiles load from their CDN. */
export function weatherRadarProxy() {
  let cache = null;
  const inFlight = new Map();

  async function refresh() {
    const upstream = await fetch(RAINVIEWER_MAPS_URL, {
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'gods-eye-view',
      },
    });
    const text = await readResponseTextCapped(upstream, RADAR_MAX_BYTES);
    if (!upstream.ok) {
      const error = new Error(`upstream HTTP ${upstream.status}`);
      error.upstreamStatus = upstream.status;
      throw error;
    }
    const catalog = normalizeRadarCatalog(JSON.parse(text));
    if (!catalog) throw new Error('malformed radar catalog');
    const payload = {
      status: 'ready',
      retrievedAt: new Date().toISOString(),
      host: catalog.host,
      latestAt: catalog.latestAt,
      frames: catalog.frames,
    };
    cache = { at: Date.now(), payload };
    return payload;
  }

  function send(res, status, body, cacheState) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
      'X-Weather-Radar': cacheState,
    });
    res.end(body);
  }

  function install(middlewares) {
    middlewares.use('/api/weather-radar', async (req, res) => {
      if (req.method !== 'GET') {
        send(res, 405, JSON.stringify({ error: 'Method Not Allowed' }), 'NONE');
        return;
      }
      const now = Date.now();
      if (cache && now - cache.at <= RADAR_CACHE_MS) {
        send(res, 200, JSON.stringify({ ...cache.payload, status: 'cached' }), 'HIT');
        return;
      }
      const stale = cache;
      const request = coalesceProxyRequest(inFlight, 'radar-catalog', refresh);
      try {
        const payload = await request.promise;
        send(
          res,
          200,
          JSON.stringify(payload),
          request.shared ? 'INFLIGHT' : 'MISS',
        );
      } catch (error) {
        const status = Number.isInteger(error?.upstreamStatus)
          ? error.upstreamStatus
          : 502;
        if (
          stale &&
          now - stale.at <= RADAR_STALE_MS
        ) {
          send(
            res,
            200,
            JSON.stringify({ ...stale.payload, status: 'stale' }),
            'STALE',
          );
          return;
        }
        send(
          res,
          status,
          JSON.stringify({ error: 'Weather radar is temporarily unavailable' }),
          'NONE',
        );
      }
    });
  }

  return {
    name: 'weather-radar-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
