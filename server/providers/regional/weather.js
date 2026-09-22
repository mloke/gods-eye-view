import { fetchRegionalJson } from './http.js';
import {
  normalizeRegionalWeather,
  normalizeRegionalWeatherMany,
} from '../../../src/data/regionalModel.js';

const WEATHER_EFFECTS_MAX_RESPONSE_BYTES = 512 * 1024;

async function fetchRegionalWeather(point) {
  const params = new URLSearchParams({
    latitude: point.latitude.toFixed(5),
    longitude: point.longitude.toFixed(5),
    current:
      'temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility',
    timezone: 'UTC',
  });
  try {
    const payload = await fetchRegionalJson(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      {
        maxBytes: WEATHER_EFFECTS_MAX_RESPONSE_BYTES,
      },
    );
    return normalizeRegionalWeather(payload);
  } catch {
    return null;
  }
}

const CURRENT_FIELDS =
  'temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,visibility';

async function fetchRegionalWeatherMany(points) {
  const requested = (points || []).filter(
    (point) =>
      Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude),
  );
  if (requested.length === 0) return [];
  if (requested.length === 1) {
    const weather = await fetchRegionalWeather(requested[0]);
    return weather
      ? [{ ...weather, lat: requested[0].latitude, lon: requested[0].longitude }]
      : [];
  }
  const params = new URLSearchParams({
    latitude: requested.map((point) => point.latitude.toFixed(5)).join(','),
    longitude: requested.map((point) => point.longitude.toFixed(5)).join(','),
    current: CURRENT_FIELDS,
    timezone: 'UTC',
  });
  try {
    const payload = await fetchRegionalJson(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      {
        maxBytes: WEATHER_EFFECTS_MAX_RESPONSE_BYTES,
      },
    );
    const rows = normalizeRegionalWeatherMany(payload, requested);
    if (rows.length === requested.length) {
      return rows.map((row, index) => ({
        ...row,
        lat: requested[index].latitude,
        lon: requested[index].longitude,
      }));
    }
    return rows;
  } catch {
    return [];
  }
}

export { fetchRegionalWeather, fetchRegionalWeatherMany };
