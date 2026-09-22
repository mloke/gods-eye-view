/** RainViewer public radar mosaic. Observed frames only; forecast nowcasts are dropped. */
export const RAINVIEWER_MAPS_URL =
  'https://api.rainviewer.com/public/weather-maps.json';
export const RADAR_TILE_HOST = 'https://tilecache.rainviewer.com';
export const RADAR_MAX_FRAMES = 8;
export const RADAR_MAX_ZOOM = 7;

const RADAR_PATH = /^\/v2\/radar\/[a-z0-9]+$/i;

/** Tile template for one published frame, or null when the path is not theirs. */
export function radarTileTemplate(path) {
  if (!RADAR_PATH.test(String(path || ''))) return null;
  return `${RADAR_TILE_HOST}${path}/256/{z}/{x}/{y}/1/1_1.png`;
}

/**
 * Accept either a raw RainViewer catalog or the app proxy's frame list.
 * Tile URLs are rebuilt from the path so a payload cannot point elsewhere.
 */
export function acceptRadarSnapshot(payload) {
  if (Array.isArray(payload?.frames)) {
    return normalizeRadarCatalog(
      {
        host: RADAR_TILE_HOST,
        radar: { past: payload.frames },
      },
      RADAR_MAX_FRAMES,
    );
  }
  return normalizeRadarCatalog(payload);
}

/**
 * Keep the newest observed frames from a RainViewer catalog.
 * A foreign host or a catalog with no usable frames is rejected.
 */
export function normalizeRadarCatalog(payload, limit = RADAR_MAX_FRAMES) {
  if (String(payload?.host || '') !== RADAR_TILE_HOST) return null;
  const past = payload?.radar?.past;
  if (!Array.isArray(past)) return null;
  const cap = Math.max(1, Math.min(RADAR_MAX_FRAMES, Number(limit) || RADAR_MAX_FRAMES));
  const frames = [];
  const seen = new Set();
  for (const row of past) {
    const time = Number(row?.time);
    const path = String(row?.path || '');
    const tileUrl = radarTileTemplate(path);
    if (!Number.isFinite(time) || time <= 0 || !tileUrl || seen.has(path)) continue;
    seen.add(path);
    frames.push({
      time,
      path,
      observedAt: new Date(time * 1000).toISOString(),
      tileUrl,
    });
  }
  frames.sort((a, b) => a.time - b.time);
  const recent = frames.slice(-cap);
  if (!recent.length) return null;
  return {
    host: RADAR_TILE_HOST,
    frames: recent,
    latestAt: recent[recent.length - 1].observedAt,
  };
}
