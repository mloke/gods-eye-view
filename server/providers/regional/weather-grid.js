import { makeRateLimiter, clientKey } from '../common/rate-limit.js';
import { requiredFiniteQueryNumber } from '../common/query.js';
import { coalesceProxyRequest } from '../common/http.js';
import { fetchRegionalWeatherMany } from './weather.js';
import {
  normalizeWeatherBounds,
  weatherSamplePoints,
} from '../../../src/layers/weather/records.js';

const WEATHER_GRID_CACHE_MS = 5 * 60_000;
const WEATHER_GRID_STALE_MS = 30 * 60_000;
const WEATHER_GRID_MAX_CACHE = 240;
const _weatherGridCache = new Map();
const _weatherGridInFlight = new Map();
const _weatherGridRateLimiter = makeRateLimiter({
  windowMs: 60_000,
  max: 45,
  globalMax: 120,
});

function trimWeatherGridCache() {
  while (_weatherGridCache.size > WEATHER_GRID_MAX_CACHE) {
    const oldest = _weatherGridCache.keys().next().value;
    if (oldest === undefined) break;
    _weatherGridCache.delete(oldest);
  }
}

function cellKey(point) {
  return `${(Math.round(point.latitude * 10) / 10).toFixed(1)},${(Math.round(point.longitude * 10) / 10).toFixed(1)}`;
}

function validWeatherBounds(params) {
  const west = requiredFiniteQueryNumber(params, 'west');
  const south = requiredFiniteQueryNumber(params, 'south');
  const east = requiredFiniteQueryNumber(params, 'east');
  const north = requiredFiniteQueryNumber(params, 'north');
  const altitudeM = requiredFiniteQueryNumber(params, 'alt');
  if (
    ![west, south, east, north, altitudeM].every(Number.isFinite) ||
    altitudeM < 0 ||
    altitudeM > 1e8
  ) {
    return null;
  }
  return normalizeWeatherBounds({ west, south, east, north, altitudeM });
}

function sampleRow(point, weather) {
  return {
    stableId: `wx:${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`,
    lat: point.latitude,
    lon: point.longitude,
    temperatureC: weather.temperatureC,
    apparentTemperatureC: weather.apparentTemperatureC,
    precipitationMm: weather.precipitationMm,
    cloudCoverPct: weather.cloudCoverPct,
    windKph: weather.windKph,
    windDirectionDeg: weather.windDirectionDeg,
    visibilityM: weather.visibilityM,
    weatherCode: weather.weatherCode,
    observedAt: weather.observedAt,
  };
}

function weatherGridProxy() {
  async function refresh(points) {
    const misses = [];
    const hits = new Map();
    const now = Date.now();
    for (const point of points) {
      const key = cellKey(point);
      const cached = _weatherGridCache.get(key);
      if (cached && now - cached.cachedAt <= WEATHER_GRID_CACHE_MS) {
        hits.set(key, cached.weather);
      } else {
        misses.push(point);
      }
    }
    if (misses.length) {
      const fetched = await fetchRegionalWeatherMany(misses);
      for (const weather of fetched) {
        const key = cellKey({
          latitude: weather.lat,
          longitude: weather.lon,
        });
        _weatherGridCache.set(key, { weather, cachedAt: Date.now() });
        hits.set(key, weather);
      }
      trimWeatherGridCache();
    }
    return points
      .map((point) => {
        const weather = hits.get(cellKey(point));
        return weather ? sampleRow(point, weather) : null;
      })
      .filter(Boolean);
  }

  function install(middlewares) {
    middlewares.use('/api/weather-grid', async (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }
      if (!_weatherGridRateLimiter(clientKey(req))) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': '10',
        });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }
      const url = new URL(req.url || '', 'http://localhost');
      const bounds = validWeatherBounds(url.searchParams);
      if (!bounds) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Valid west, south, east, north, and alt are required',
          }),
        );
        return;
      }
      const points = weatherSamplePoints(bounds);
      const key = points.map((point) => cellKey(point)).join('|');
      const now = Date.now();
      const cached = _weatherGridCache.get(`grid:${key}`);
      if (cached && now - cached.cachedAt <= WEATHER_GRID_CACHE_MS) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
          'X-Weather-Grid': 'HIT',
        });
        res.end(JSON.stringify({ ...cached.payload, status: 'cached' }));
        return;
      }
      const request = coalesceProxyRequest(_weatherGridInFlight, key, async () => {
        const samples = await refresh(points);
        if (!samples.length) throw new Error('Weather grid unavailable');
        const payload = {
          status: 'ready',
          retrievedAt: new Date().toISOString(),
          samples,
        };
        _weatherGridCache.set(`grid:${key}`, { payload, cachedAt: Date.now() });
        trimWeatherGridCache();
        return payload;
      });
      try {
        const payload = await request.promise;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
          'X-Weather-Grid': request.shared ? 'INFLIGHT' : 'MISS',
        });
        res.end(JSON.stringify(payload));
      } catch {
        if (cached && now - cached.cachedAt <= WEATHER_GRID_STALE_MS) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Weather-Grid': 'STALE',
          });
          res.end(JSON.stringify({ ...cached.payload, status: 'stale' }));
          return;
        }
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Weather observations are temporarily unavailable',
          }),
        );
      }
    });
  }

  return {
    name: 'weather-grid-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

export { weatherGridProxy };
