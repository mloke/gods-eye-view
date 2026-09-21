export const GEOFENCE_WATCH_MAX_FENCES = 32;
export const GEOFENCE_WATCH_MAX_EVENTS = 400;
export const GEOFENCE_WATCH_SOURCE_IDS = Object.freeze(['sdpd-reports']);
export const GEOFENCE_WATCH_SOURCE_LABELS = Object.freeze({
  'sdpd-reports': 'SDPD',
});

/** Format an offense instant in America/Los_Angeles. */
export function formatWatchOccurredOn(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms));
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ALLOWED_LAYERS = new Set(GEOFENCE_WATCH_SOURCE_IDS);

function text(value, max = 80) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function layers(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const id = text(item, 40);
    if (!id || !ALLOWED_LAYERS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function ringPoint(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return null;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

/** Closed lon/lat ring with at least three distinct vertices. */
export function normalizeFenceRing(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const ring = [];
  for (const point of value) {
    const next = ringPoint(point);
    if (!next) return null;
    const previous = ring[ring.length - 1];
    if (previous && previous[0] === next[0] && previous[1] === next[1])
      continue;
    ring.push(next);
  }
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring.length >= 3 ? ring : null;
}

/** Ray-cast point-in-polygon. Ring vertices are [lon, lat]. */
export function pointInFenceRing(ring, lat, lon) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Validate one watch-zone fence before it can receive events. */
export function normalizeGeofence(row, index = 0) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const ring = normalizeFenceRing(row.ring);
  const name = text(row.name, 80);
  const watched = layers(row.layers);
  if (!ring || !name || !watched.length) return null;
  const color = text(row.color, 7);
  return {
    stableId: text(row.id, 64) || `fence-${index + 1}`,
    name,
    enabled: row.enabled !== false,
    layers: watched,
    note: text(row.note, 200),
    color: color && HEX_COLOR.test(color) ? color : null,
    drawn: row.drawn === true,
    ring,
  };
}

function nextDrawnId(existing = []) {
  const used = new Set(
    existing.map((fence) => fence?.stableId).filter(Boolean),
  );
  let n = existing.length + 1;
  let id = `drawn-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `drawn-${n}`;
  }
  return id;
}

/** Build a browser-persisted watch zone from a finished map ring. */
export function createDrawnGeofence(row, existing = []) {
  const count = Array.isArray(existing) ? existing.length : 0;
  return normalizeGeofence(
    {
      id: text(row?.id, 64) || nextDrawnId(existing),
      name:
        text(row?.name, 80) ||
        (count ? `Drawn zone ${count + 1}` : 'Drawn zone'),
      enabled: row?.enabled !== false,
      layers:
        Array.isArray(row?.layers) && row.layers.length
          ? row.layers
          : ['sdpd-reports'],
      color: row?.color || '#39d0ff',
      note: row?.note,
      drawn: true,
      ring: row?.ring,
    },
    count,
  );
}

export const GEOFENCE_DRAW_MIN_VERTICES = 3;
export const GEOFENCE_DRAW_MAX_VERTICES = 64;
const MIN_VERTEX_SEPARATION_M = 2;

function greatCircleM(a, b) {
  const radiusM = 6_371_000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusM * Math.asin(Math.sqrt(Math.min(1, h)));
}

function roundCoord(value) {
  return Math.round(Number(value) * 1e5) / 1e5;
}

/** Empty vertex session for a map-drawn watch zone. */
export function createFenceDrawSession() {
  return { vertices: [] };
}

/** Add one map click to the zone being drawn. */
export function addFenceDrawVertex(session, vertex) {
  if (!session) return { added: false, reason: 'invalid' };
  const lon = Number(vertex?.lon);
  const lat = Number(vertex?.lat);
  if (!Number.isFinite(lon) || Math.abs(lon) > 180)
    return { added: false, reason: 'invalid' };
  if (!Number.isFinite(lat) || Math.abs(lat) > 90)
    return { added: false, reason: 'invalid' };
  if (session.vertices.length >= GEOFENCE_DRAW_MAX_VERTICES)
    return { added: false, reason: 'full' };
  const next = {
    lon,
    lat,
    height: Number.isFinite(vertex?.height) ? vertex.height : 0,
  };
  const last = session.vertices[session.vertices.length - 1];
  if (last && greatCircleM(last, next) < MIN_VERTEX_SEPARATION_M)
    return { added: false, reason: 'duplicate' };
  session.vertices.push(next);
  return { added: true };
}

/** Undo the last corner. */
export function removeFenceDrawVertex(session) {
  if (!session?.vertices?.length) return false;
  session.vertices.pop();
  return true;
}

/** Status line while a zone is being drawn on the globe. */
export function fenceDrawHint(session) {
  if (!session) return '';
  const count = session.vertices.length;
  if (count === 0) return 'Click the map to place the first corner.';
  if (count === 1) return 'Click the next corner. Esc cancels.';
  if (count === 2) return 'One more corner to close the zone.';
  return `${count} corners · Double-click or Enter to finish · Backspace undoes`;
}

/** Close a draw session into a watch-zone ring, or null if it is too thin. */
export function finishFenceDrawRing(session) {
  return normalizeFenceRing(
    (session?.vertices || []).map((vertex) => [
      roundCoord(vertex.lon),
      roundCoord(vertex.lat),
    ]),
  );
}

/** Validate the geofences file before it can replace displayed watch zones. */
export function normalizeGeofences(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.fences)
      ? payload.fences
      : null;
  if (!rows) return null;
  const normalized = [];
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const record = normalizeGeofence(row, index);
    if (!record) return null;
    if (ids.has(record.stableId)) return null;
    ids.add(record.stableId);
    normalized.push(record);
    if (normalized.length >= GEOFENCE_WATCH_MAX_FENCES) break;
  }
  return normalized;
}

function flag(value) {
  return value === true;
}

/** Build a durable log row from one source record inside a fence. */
export function createGeofenceEvent(fence, sourceId, row) {
  const stableId = text(row?.stableId ?? row?.id, 64);
  const fenceId = text(fence?.stableId, 64);
  const source = text(sourceId, 40);
  const lat = Number(row?.lat);
  const lon = Number(row?.lon);
  if (!stableId || !fenceId || !ALLOWED_LAYERS.has(source)) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const occurredOnMs = Number(row?.occurredOnMs ?? row?.timeMs);
  const title =
    text(row?.offense, 80) ||
    text(row?.title, 80) ||
    text(row?.category, 80) ||
    'Report';
  return {
    id: `${source}:${fenceId}:${stableId}`,
    fenceId,
    fenceName: text(fence?.name, 80) || fenceId,
    sourceId: source,
    sourceLabel: GEOFENCE_WATCH_SOURCE_LABELS[source] || source,
    stableId,
    title,
    category: text(row?.category, 80),
    neighborhood: text(row?.neighborhood, 200),
    blockAddress: text(row?.blockAddress, 254),
    caseNumber: text(row?.caseNumber, 55),
    violent: flag(row?.violent),
    property: flag(row?.property),
    lat,
    lon,
    occurredOnMs: Number.isFinite(occurredOnMs) ? occurredOnMs : null,
  };
}

/** Validate one already-logged watch event before it can replace stored rows. */
export function normalizeGeofenceEvent(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const event = createGeofenceEvent(
    { stableId: row.fenceId, name: row.fenceName },
    row.sourceId,
    row,
  );
  if (!event || text(row.id, 160) !== event.id) return null;
  const loggedAtMs = Number(row.loggedAtMs);
  return {
    ...event,
    loggedAtMs: Number.isFinite(loggedAtMs) ? loggedAtMs : null,
  };
}

/** Validate a complete watch log before it can replace displayed events. */
export function normalizeGeofenceEvents(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.events)
      ? payload.events
      : null;
  if (!rows) return [];
  const normalized = [];
  const ids = new Set();
  for (const row of rows) {
    const event = normalizeGeofenceEvent(row);
    if (!event || ids.has(event.id)) continue;
    ids.add(event.id);
    normalized.push(event);
    if (normalized.length >= GEOFENCE_WATCH_MAX_EVENTS) break;
  }
  return normalized;
}
