import {
  createDrawnGeofence,
  createGeofenceEvent,
  pointInFenceRing,
} from './records.js';
import {
  clearGeofenceWatchLog,
  isGeofenceWatchSeeded,
  markGeofenceWatchSeeded,
  readDrawnGeofences,
  readGeofenceWatchLog,
  readRemovedGeofenceIds,
  writeDrawnGeofences,
  writeGeofenceWatchLog,
  writeRemovedGeofenceIds,
} from './log.js';

function stamp(event, loggedAtMs) {
  return { ...event, loggedAtMs };
}

function mergeEnabledFences(fileFences, drawnFences, removedIds) {
  const byId = new Map();
  for (const fence of fileFences || []) byId.set(fence.stableId, fence);
  for (const fence of drawnFences || []) byId.set(fence.stableId, fence);
  return [...byId.values()].filter(
    (fence) => fence.enabled && !removedIds?.has(fence.stableId),
  );
}

/** Match source snapshots against enabled fences and keep a durable event log. */
export function createGeofenceWatch({
  fenceSource,
  eventSources = {},
  storage = globalThis.localStorage,
  now = () => Date.now(),
} = {}) {
  if (typeof fenceSource?.getSnapshot !== 'function')
    throw new TypeError('Geofence watch requires a fence snapshot source');

  let fileFences = [];
  let drawnFences = readDrawnGeofences(storage);
  let removedIds = new Set(readRemovedGeofenceIds(storage));
  let fences = mergeEnabledFences(fileFences, drawnFences, removedIds);
  let events = readGeofenceWatchLog(storage);
  let lastError = null;
  let lastUpdate = null;
  let lastAdded = [];
  const listeners = new Set();

  function applyFences() {
    fences = mergeEnabledFences(fileFences, drawnFences, removedIds);
    return fences;
  }

  function dropFence(stableId) {
    const id = typeof stableId === 'string' ? stableId.trim() : '';
    if (!id) return false;
    const drawnNext = drawnFences.filter((fence) => fence.stableId !== id);
    const wasDrawn = drawnNext.length !== drawnFences.length;
    if (wasDrawn) {
      drawnFences = writeDrawnGeofences(drawnNext, storage);
    }
    const visible = fences.some((fence) => fence.stableId === id);
    const wasFile =
      fileFences.some((fence) => fence.stableId === id) ||
      (visible && !wasDrawn);
    if (wasFile && !removedIds.has(id)) {
      removedIds.add(id);
      writeRemovedGeofenceIds([...removedIds], storage);
    }
    if (!wasDrawn && !wasFile) return false;
    applyFences();
    emit();
    return true;
  }

  function state() {
    return {
      fences,
      events,
      lastError,
      lastUpdate,
      lastAdded,
      seeded: isGeofenceWatchSeeded(storage),
    };
  }

  function emit() {
    const snapshot = state();
    for (const listener of listeners) listener(snapshot);
  }

  return {
    getState: state,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      events = clearGeofenceWatchLog(storage);
      emit();
      return events;
    },
    addDrawnFence(input) {
      const fence = createDrawnGeofence(input, drawnFences);
      if (!fence) return null;
      drawnFences = writeDrawnGeofences(
        [
          ...drawnFences.filter((row) => row.stableId !== fence.stableId),
          fence,
        ],
        storage,
      );
      applyFences();
      emit();
      return fence;
    },
    removeFence: dropFence,
    removeDrawnFence: dropFence,
    async refresh({ signal } = {}) {
      signal?.throwIfAborted();
      const seeded = isGeofenceWatchSeeded(storage);
      try {
        const nextFences = await fenceSource.getSnapshot({ signal });
        signal?.throwIfAborted();
        fileFences = Array.isArray(nextFences) ? nextFences : [];
        drawnFences = readDrawnGeofences(storage);
        removedIds = new Set(readRemovedGeofenceIds(storage));
        applyFences();
        const known = new Set(events.map((event) => event.id));
        const added = [];
        const loggedAtMs = now();
        for (const fence of fences) {
          for (const sourceId of fence.layers) {
            const source = eventSources[sourceId];
            if (typeof source?.getSnapshot !== 'function') continue;
            const rows = await source.getSnapshot({ signal });
            signal?.throwIfAborted();
            if (!Array.isArray(rows)) continue;
            for (const row of rows) {
              if (!pointInFenceRing(fence.ring, row.lat, row.lon)) continue;
              const event = createGeofenceEvent(fence, sourceId, row);
              if (!event || known.has(event.id)) continue;
              known.add(event.id);
              added.push(stamp(event, loggedAtMs));
            }
          }
        }
        if (added.length) {
          events = writeGeofenceWatchLog([...added, ...events], storage);
        }
        markGeofenceWatchSeeded(storage, true);
        lastAdded = seeded ? added : [];
        lastUpdate = loggedAtMs;
        lastError = null;
        emit();
        return {
          fences,
          events,
          added: lastAdded,
          seeded,
        };
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        lastError = error?.message || 'Geofence watch unavailable';
        emit();
        throw error;
      }
    },
  };
}
