export const WEATHER_MAX_SAMPLES = 16;
export const WEATHER_LAYER_ID = 'weather';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function wrapLon(lon) {
  const value = ((((Number(lon) + 180) % 360) + 360) % 360) - 180;
  return value === 180 ? -180 : value;
}

/** Spacing for a viewport sample grid. Coarser as the camera climbs. */
export function weatherSampleSpacingDeg(altitudeM) {
  const alt = Number(altitudeM);
  if (!(alt > 0) || alt >= 8_000_000) return 28;
  if (alt >= 3_000_000) return 12;
  if (alt >= 800_000) return 5;
  if (alt >= 200_000) return 2;
  if (alt >= 50_000) return 0.75;
  return 0.25;
}

/**
 * Normalize camera rectangle fields. Missing globe-scale rectangles become a
 * world sample so the layer still has something honest to request.
 */
export function normalizeWeatherBounds(bounds) {
  const west = finite(bounds?.west);
  const south = finite(bounds?.south);
  const east = finite(bounds?.east);
  const north = finite(bounds?.north);
  const altitudeM = finite(bounds?.altitudeM);
  if (
    west == null ||
    south == null ||
    east == null ||
    north == null ||
    Math.abs(west) > 180 ||
    Math.abs(east) > 180 ||
    south < -90 ||
    north > 90 ||
    south > north
  ) {
    return {
      west: -180,
      south: -55,
      east: 180,
      north: 70,
      altitudeM: altitudeM ?? 12_000_000,
    };
  }
  return {
    west,
    south,
    east,
    north,
    altitudeM: altitudeM ?? 12_000_000,
  };
}

/** Sample points that fill the current Earth view without flooding Open-Meteo. */
export function weatherSamplePoints(bounds) {
  const box = normalizeWeatherBounds(bounds);
  const spacing = weatherSampleSpacingDeg(box.altitudeM);
  let east = box.east;
  if (east < box.west) east += 360;
  const width = east - box.west;
  const height = box.north - box.south;
  const points = [];
  const seen = new Set();

  function add(lat, lon) {
    const latitude = Math.max(-85, Math.min(85, lat));
    const longitude = wrapLon(lon);
    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    if (seen.has(key) || points.length >= WEATHER_MAX_SAMPLES) return;
    seen.add(key);
    points.push({ latitude, longitude });
  }

  add(box.south + height / 2, box.west + width / 2);

  // Street-level views are smaller than one grid cell. Keep the camera sample
  // instead of expanding a hidden 2x2 ring outside the keyhole.
  if (width < spacing && height < spacing) return points;

  const cols = Math.min(4, Math.max(2, Math.round(width / spacing)));
  const rows = Math.min(4, Math.max(2, Math.round(height / spacing)));
  for (let row = 0; row < rows; row++) {
    const lat = box.south + ((row + 0.5) * height) / rows;
    for (let col = 0; col < cols; col++) {
      add(lat, box.west + ((col + 0.5) * width) / cols);
    }
  }
  return points;
}

/** True when the camera moved enough to justify a new grid. */
export function weatherViewportMoved(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  const a = normalizeWeatherBounds(prev);
  const b = normalizeWeatherBounds(next);
  if (weatherSampleSpacingDeg(a.altitudeM) !== weatherSampleSpacingDeg(b.altitudeM))
    return true;
  const span = Math.max(
    Math.abs(b.east - b.west) || 1,
    Math.abs(b.north - b.south) || 1,
    1,
  );
  return (
    Math.abs(b.west - a.west) > span * 0.25 ||
    Math.abs(b.east - a.east) > span * 0.25 ||
    Math.abs(b.south - a.south) > span * 0.25 ||
    Math.abs(b.north - a.north) > span * 0.25
  );
}

function weatherSampleId(lat, lon) {
  return `wx:${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

/** Accept a complete grid snapshot before replacing displayed samples. */
export function normalizeWeatherSnapshot(payload) {
  const rows = Array.isArray(payload?.samples)
    ? payload.samples
    : Array.isArray(payload)
      ? payload
      : null;
  if (!rows) return null;
  const out = [];
  const ids = new Set();
  for (const row of rows) {
    const lat = finite(row?.lat ?? row?.latitude);
    const lon = finite(row?.lon ?? row?.longitude);
    const temperatureC = finite(row?.temperatureC);
    if (
      lat == null ||
      lon == null ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180 ||
      temperatureC == null
    )
      return null;
    const stableId =
      typeof row?.stableId === 'string' && row.stableId.trim()
        ? row.stableId.trim()
        : weatherSampleId(lat, lon);
    if (ids.has(stableId)) return null;
    ids.add(stableId);
    out.push({
      stableId,
      lat,
      lon,
      temperatureC,
      apparentTemperatureC: finite(row?.apparentTemperatureC),
      precipitationMm: finite(row?.precipitationMm),
      cloudCoverPct: finite(row?.cloudCoverPct),
      windKph: finite(row?.windKph),
      windDirectionDeg: finite(row?.windDirectionDeg),
      visibilityM: finite(row?.visibilityM),
      weatherCode: finite(row?.weatherCode),
      observedAt:
        typeof row?.observedAt === 'string' && row.observedAt.trim()
          ? row.observedAt.trim()
          : null,
    });
    if (out.length >= WEATHER_MAX_SAMPLES) break;
  }
  return out;
}
