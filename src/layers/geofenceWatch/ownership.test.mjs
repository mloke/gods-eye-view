import assert from 'node:assert/strict';
import test from 'node:test';
import exampleFences from '../../../config/geofences.example.json' with { type: 'json' };
import { createGeofenceWatchLayer } from './index.js';
import { createGeofenceWatchSource } from './source.js';

function hangingSnapshot() {
  let resolve;
  let signal;
  return {
    getSnapshot(options) {
      signal = options.signal;
      return new Promise((done) => {
        resolve = done;
      });
    },
    get signal() {
      return signal;
    },
    resolve(value) {
      resolve?.(value);
    },
  };
}

function harness({ fenceSource, eventSource } = {}) {
  const sources = [];
  const events = [];
  const viewer = {
    dataSources: {
      add(value) {
        sources.push(value);
      },
      remove(value) {
        sources.splice(sources.indexOf(value), 1);
      },
    },
  };
  const layer = createGeofenceWatchLayer({
    fenceSource:
      fenceSource || createGeofenceWatchSource({ payload: exampleFences }),
    eventSources: { 'sdpd-reports': eventSource },
    overlayHost: {
      setEntries(...args) {
        events.push(args);
      },
      setVisible() {},
      clearSource() {},
    },
    storage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
  });
  layer.init(viewer);
  layer.enable(viewer);
  return { layer, viewer, sources, events };
}

const row = {
  stableId: 'report-a',
  caseNumber: '26000001',
  occurredOnMs: 1_789_776_000_000,
  offense: 'Vandalism',
  category: 'Vandalism',
  neighborhood: 'Barrio Logan',
  blockAddress: '1800 MAIN ST',
  violent: false,
  property: true,
  lon: -117.155,
  lat: 32.6975,
};

test('late geofence refresh cannot publish after disable or destroy', async () => {
  for (const action of ['disable', 'destroy']) {
    const fences = hangingSnapshot();
    const reports = hangingSnapshot();
    const h = harness({ fenceSource: fences, eventSource: reports });
    const pending = h.layer.update(h.viewer);
    h.layer[action](h.viewer);
    assert.equal(fences.signal.aborted, true);
    if (action === 'disable') h.layer.enable(h.viewer);
    const published = h.events.length;
    fences.resolve(exampleFences.fences);
    reports.resolve([row]);
    assert.equal(await pending, false);
    assert.equal(h.layer.getStats().count, 0);
    assert.equal(h.events.length, published);
    h.layer.destroy(h.viewer);
  }
});

test('two geofence displays own separate data sources and destruction', async () => {
  const a = harness({
    eventSource: { getSnapshot: async () => [row] },
  });
  const b = harness({
    eventSource: { getSnapshot: async () => [] },
  });
  await a.layer.update(a.viewer);
  await b.layer.update(b.viewer);
  assert.equal(a.layer.getStats().count, 1);
  assert.equal(b.layer.getStats().count, 0);
  assert.equal(a.layer.getWatchState().events[0].title, 'Vandalism');
  a.layer.destroy();
  assert.equal(a.sources.length, 0);
  assert.equal(b.sources.length, 1);
  b.layer.destroy();
});
