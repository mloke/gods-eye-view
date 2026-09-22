import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherLayer } from './index.js';
import { createWeatherSource } from './source.js';

function harness(source) {
  const imagery = [];
  const events = [];
  const viewer = {
    imageryLayers: {
      addImageryProvider(provider) {
        const layer = { provider, show: true, alpha: 1 };
        imagery.push(layer);
        return layer;
      },
      remove(layer) {
        const index = imagery.indexOf(layer);
        if (index >= 0) imagery.splice(index, 1);
        return true;
      },
    },
  };
  const layer = createWeatherLayer({
    source,
    overlayHost: {
      setEntries(...args) {
        events.push(args);
      },
      setVisible() {},
      clearSource() {},
    },
  });
  layer.init(viewer);
  layer.enable();
  return { layer, viewer, imagery, events };
}

function catalog(path = '/v2/radar/abc') {
  return {
    latestAt: '2026-09-22T19:00:00.000Z',
    frames: [
      {
        time: 1_758_000_000,
        path,
        observedAt: '2026-09-22T19:00:00.000Z',
        tileUrl: `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/1/1_1.png`,
      },
    ],
  };
}

test('late weather refresh cannot publish after disable, re-enable, or destroy', async () => {
  for (const action of ['disable', 'destroy']) {
    let resolve;
    let signal;
    const h = harness({
      getSnapshot(options) {
        signal = options.signal;
        return new Promise((done) => {
          resolve = done;
        });
      },
    });
    const pending = h.layer.update(h.viewer);
    h.layer[action](h.viewer);
    assert.equal(signal.aborted, true);
    if (action === 'disable') h.layer.enable();
    resolve(catalog());
    assert.equal(await pending, false);
    assert.equal(h.layer.getStats().count, 0);
    assert.equal(h.imagery.length, 0);
    assert.equal(h.events.length, 0);
    h.layer.destroy(h.viewer);
  }
});

test('radar frames stay loaded and only one frame is visible', async () => {
  const h = harness({
    getSnapshot: async () => ({
      latestAt: '2026-09-22T19:20:00.000Z',
      frames: [0, 1].map((index) => ({
        time: 1_758_000_000 + index * 600,
        path: `/v2/radar/frame${index}`,
        observedAt: '2026-09-22T19:00:00.000Z',
        tileUrl: `https://tilecache.rainviewer.com/v2/radar/frame${index}/256/{z}/{x}/{y}/1/1_1.png`,
      })),
    }),
  });
  try {
    await h.layer.update(h.viewer);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(h.imagery.length, 2);
    assert.equal(
      h.imagery.every((layer) => layer.show),
      true,
    );
    assert.equal(h.imagery.filter((layer) => layer.alpha === 0).length, 1);
    assert.equal(h.imagery.filter((layer) => layer.alpha > 0).length, 1);
  } finally {
    h.layer.destroy(h.viewer);
  }
});

test('two weather displays own separate radar imagery and destruction', async () => {
  const a = harness({ getSnapshot: async () => catalog('/v2/radar/one') });
  const b = harness({ getSnapshot: async () => catalog('/v2/radar/two') });
  await a.layer.update(a.viewer);
  await b.layer.update(b.viewer);
  assert.equal(a.layer.getStats().countLabel, 'RADAR');
  assert.equal(a.imagery.length, 1);
  assert.equal(b.imagery.length, 1);
  assert.equal(a.layer.getAnalystRecords().length, 0);
  a.layer.destroy();
  assert.equal(a.imagery.length, 0);
  assert.equal(b.imagery.length, 1);
  b.layer.destroy();
  assert.equal(b.imagery.length, 0);
});

test('weather source honors cancellation after a late JSON body', async () => {
  const abort = new AbortController();
  const source = createWeatherSource({
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        abort.abort();
        return { frames: [] };
      },
    }),
  });
  await assert.rejects(source.getSnapshot({ signal: abort.signal }), {
    name: 'AbortError',
  });
});

test('weather source rejects a catalog that is not the radar mosaic', async () => {
  const source = createWeatherSource({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ samples: [{ temperatureC: 18 }] }),
    }),
  });
  await assert.rejects(source.getSnapshot(), /Malformed weather radar response/);
});
