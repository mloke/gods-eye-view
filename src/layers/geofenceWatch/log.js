import {
  GEOFENCE_WATCH_MAX_EVENTS,
  GEOFENCE_WATCH_MAX_FENCES,
  normalizeGeofence,
  normalizeGeofenceEvents,
} from './records.js';

export const GEOFENCE_WATCH_LOG_KEY = 'gev:geofence-watch:v1';
export const GEOFENCE_WATCH_SEEDED_KEY = 'gev:geofence-watch:seeded:v1';
export const GEOFENCE_WATCH_DRAWN_KEY = 'gev:geofence-watch:drawn:v1';
export const GEOFENCE_WATCH_REMOVED_KEY = 'gev:geofence-watch:removed:v1';

function readJson(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
  } catch {
    /* browser storage can be blocked */
  }
}

/** Read the persisted watch log. Missing or unreadable is empty. */
export function readGeofenceWatchLog(storage = globalThis.localStorage) {
  return normalizeGeofenceEvents(readJson(storage, GEOFENCE_WATCH_LOG_KEY));
}

/** Whether the first snapshot has already been absorbed without toasts. */
export function isGeofenceWatchSeeded(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(GEOFENCE_WATCH_SEEDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markGeofenceWatchSeeded(
  storage = globalThis.localStorage,
  seeded = true,
) {
  try {
    if (seeded) storage?.setItem?.(GEOFENCE_WATCH_SEEDED_KEY, '1');
    else storage?.removeItem?.(GEOFENCE_WATCH_SEEDED_KEY);
  } catch {
    /* browser storage can be blocked */
  }
  return !!seeded;
}

/** Persist newest-first events and return the stored list. */
export function writeGeofenceWatchLog(
  events,
  storage = globalThis.localStorage,
) {
  const normalized = normalizeGeofenceEvents(events).slice(
    0,
    GEOFENCE_WATCH_MAX_EVENTS,
  );
  writeJson(storage, GEOFENCE_WATCH_LOG_KEY, { events: normalized });
  return normalized;
}

function serializeDrawnFence(fence) {
  return {
    id: fence.stableId,
    name: fence.name,
    enabled: fence.enabled,
    layers: fence.layers,
    note: fence.note,
    color: fence.color,
    drawn: true,
    ring: fence.ring,
  };
}

/** Read map-drawn watch zones. Missing or unreadable is empty. */
export function readDrawnGeofences(storage = globalThis.localStorage) {
  const payload = readJson(storage, GEOFENCE_WATCH_DRAWN_KEY);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.fences)
      ? payload.fences
      : [];
  const fences = [];
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const record = normalizeGeofence({ ...row, drawn: true }, index);
    if (!record || ids.has(record.stableId)) continue;
    ids.add(record.stableId);
    fences.push(record);
    if (fences.length >= GEOFENCE_WATCH_MAX_FENCES) break;
  }
  return fences;
}

/** Persist map-drawn watch zones and return the stored list. */
export function writeDrawnGeofences(fences, storage = globalThis.localStorage) {
  const rows = [];
  const ids = new Set();
  for (const [index, fence] of (Array.isArray(fences)
    ? fences
    : []
  ).entries()) {
    const record = normalizeGeofence(
      {
        id: fence?.stableId || fence?.id,
        name: fence?.name,
        enabled: fence?.enabled,
        layers: fence?.layers,
        note: fence?.note,
        color: fence?.color,
        drawn: true,
        ring: fence?.ring,
      },
      index,
    );
    if (!record || ids.has(record.stableId)) continue;
    ids.add(record.stableId);
    rows.push(record);
    if (rows.length >= GEOFENCE_WATCH_MAX_FENCES) break;
  }
  writeJson(storage, GEOFENCE_WATCH_DRAWN_KEY, {
    fences: rows.map(serializeDrawnFence),
  });
  return rows;
}

function normalizeRemovedIds(value) {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value?.ids)
      ? value.ids
      : [];
  const ids = [];
  const seen = new Set();
  for (const row of rows) {
    if (typeof row !== 'string') continue;
    const id = row.trim().slice(0, 64);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= GEOFENCE_WATCH_MAX_FENCES) break;
  }
  return ids;
}

/** Read dismissed file-zone ids. Missing or unreadable is empty. */
export function readRemovedGeofenceIds(storage = globalThis.localStorage) {
  return normalizeRemovedIds(readJson(storage, GEOFENCE_WATCH_REMOVED_KEY));
}

/** Persist dismissed file-zone ids and return the stored list. */
export function writeRemovedGeofenceIds(
  ids,
  storage = globalThis.localStorage,
) {
  const normalized = normalizeRemovedIds(ids);
  writeJson(storage, GEOFENCE_WATCH_REMOVED_KEY, { ids: normalized });
  return normalized;
}

/** Drop the log and first-seed marker so the next poll can refill quietly. */
export function clearGeofenceWatchLog(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(GEOFENCE_WATCH_LOG_KEY);
    storage?.removeItem?.(GEOFENCE_WATCH_SEEDED_KEY);
  } catch {
    /* browser storage can be blocked */
  }
  return [];
}
