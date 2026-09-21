import assert from 'node:assert/strict';
import test from 'node:test';
import exampleFences from '../../../config/geofences.example.json' with { type: 'json' };
import { createGeofenceWatchSource } from './source.js';
import { createGeofenceWatch } from './watch.js';
import {
  GEOFENCE_WATCH_DRAWN_KEY,
  GEOFENCE_WATCH_LOG_KEY,
  GEOFENCE_WATCH_REMOVED_KEY,
  GEOFENCE_WATCH_SEEDED_KEY,
} from './log.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

const inside = {
  stableId: 'in-1',
  offense: 'Vandalism',
  category: 'Vandalism',
  neighborhood: 'Barrio Logan',
  violent: false,
  property: true,
  lat: 32.6975,
  lon: -117.155,
  occurredOnMs: 1_700_000_000_000,
};
const outside = {
  stableId: 'out-1',
  offense: 'Theft',
  category: 'Theft',
  neighborhood: 'East Village',
  lat: 32.7073,
  lon: -117.1566,
  occurredOnMs: 1_700_000_000_000,
};

test('first refresh seeds the log quietly; later matches toast as added', async () => {
  const storage = memoryStorage();
  const watch = createGeofenceWatch({
    fenceSource: createGeofenceWatchSource({ payload: exampleFences }),
    eventSources: {
      'sdpd-reports': { getSnapshot: async () => [inside, outside] },
    },
    storage,
    now: () => 1_700_000_100_000,
  });
  const first = await watch.refresh();
  assert.equal(first.added.length, 0);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].stableId, 'in-1');
  assert.equal(storage.getItem(GEOFENCE_WATCH_SEEDED_KEY), '1');

  const later = {
    ...inside,
    stableId: 'in-2',
    offense: 'Robbery',
    violent: true,
    property: false,
  };
  const watch2 = createGeofenceWatch({
    fenceSource: createGeofenceWatchSource({ payload: exampleFences }),
    eventSources: {
      'sdpd-reports': { getSnapshot: async () => [inside, later, outside] },
    },
    storage,
    now: () => 1_700_000_200_000,
  });
  const second = await watch2.refresh();
  assert.equal(second.added.length, 1);
  assert.equal(second.added[0].stableId, 'in-2');
  assert.equal(second.events.length, 2);
  assert.ok(storage.getItem(GEOFENCE_WATCH_LOG_KEY).includes('in-2'));
});

test('clearing the log drops stored events and the seed marker', async () => {
  const storage = memoryStorage();
  const watch = createGeofenceWatch({
    fenceSource: createGeofenceWatchSource({ payload: exampleFences }),
    eventSources: {
      'sdpd-reports': { getSnapshot: async () => [inside] },
    },
    storage,
  });
  await watch.refresh();
  assert.equal(watch.getState().events.length, 1);
  watch.clear();
  assert.equal(watch.getState().events.length, 0);
  assert.equal(storage.getItem(GEOFENCE_WATCH_SEEDED_KEY), null);
});

test('a drawn zone merges with file fences and can be removed', async () => {
  const storage = memoryStorage();
  const watch = createGeofenceWatch({
    fenceSource: createGeofenceWatchSource({ payload: exampleFences }),
    eventSources: {
      'sdpd-reports': { getSnapshot: async () => [inside, outside] },
    },
    storage,
    now: () => 1_700_000_100_000,
  });
  const drawn = watch.addDrawnFence({
    name: 'Harbor pocket',
    ring: [
      [-117.156, 32.696],
      [-117.154, 32.696],
      [-117.154, 32.698],
      [-117.156, 32.698],
    ],
  });
  assert.equal(drawn.drawn, true);
  assert.ok(
    storage.getItem(GEOFENCE_WATCH_DRAWN_KEY).includes('Harbor pocket'),
  );
  const first = await watch.refresh();
  assert.equal(first.fences.length, 2);
  assert.ok(first.fences.some((fence) => fence.stableId === drawn.stableId));
  assert.equal(watch.removeDrawnFence(drawn.stableId), true);
  const second = await watch.refresh();
  assert.equal(second.fences.length, 1);
  assert.equal(second.fences[0].stableId, 'barrio-logan-sw-i5');
});

test('a file zone can be removed from the menu and stays gone', async () => {
  const storage = memoryStorage();
  const watch = createGeofenceWatch({
    fenceSource: createGeofenceWatchSource({ payload: exampleFences }),
    eventSources: {
      'sdpd-reports': { getSnapshot: async () => [inside, outside] },
    },
    storage,
  });
  await watch.refresh();
  assert.equal(watch.getState().fences[0].stableId, 'barrio-logan-sw-i5');
  assert.equal(watch.removeFence('barrio-logan-sw-i5'), true);
  assert.equal(watch.getState().fences.length, 0);
  assert.ok(
    storage.getItem(GEOFENCE_WATCH_REMOVED_KEY).includes('barrio-logan-sw-i5'),
  );
  const again = await watch.refresh();
  assert.equal(again.fences.length, 0);
});
