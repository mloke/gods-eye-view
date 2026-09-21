import assert from 'node:assert/strict';
import test from 'node:test';
import { createSdpdReportsLayer } from './index.js';
import { createSdpdReportsSource } from './source.js';

function harness(source) {
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
  const layer = createSdpdReportsLayer({
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
  layer.enable(viewer);
  return { layer, viewer, sources, events };
}

const row = {
  stableId: 'report-a',
  caseNumber: '26000001',
  occurredOnMs: 1_789_776_000_000,
  offense: 'Robbery',
  category: 'Robbery',
  crimeAgainst: 'PE',
  violent: true,
  property: false,
  neighborhood: 'East Village',
  blockAddress: '500 J ST',
  division: 'Central',
  lon: -117.16,
  lat: 32.71,
};

test('late SDPD refresh cannot publish after disable, re-enable, or destroy', async () => {
  for (const action of ['disable', 'destroy']) {
    let resolve, signal;
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
    if (action === 'disable') h.layer.enable(h.viewer);
    resolve([row]);
    assert.equal(await pending, false);
    assert.equal(h.layer.getStats().count, 0);
    assert.equal(h.events.length, 0);
    h.layer.destroy(h.viewer);
  }
});

test('two SDPD displays own separate data sources and destruction', async () => {
  const a = harness({ getSnapshot: async () => [row] });
  const b = harness({ getSnapshot: async () => [] });
  await a.layer.update(a.viewer);
  await b.layer.update(b.viewer);
  assert.equal(a.layer.getStats().count, 1);
  assert.equal(b.layer.getStats().count, 0);
  assert.equal(a.layer.getAnalystRecords()[0].offense, 'Robbery');
  a.layer.destroy();
  assert.equal(a.sources.length, 0);
  assert.equal(b.sources.length, 1);
  b.layer.destroy();
});

test('SDPD window chips change the requested age and stay exclusive', () => {
  const requested = [];
  const h = harness({
    getSnapshot: async ({ windowDays } = {}) => {
      requested.push(windowDays);
      return [];
    },
    setWindowDays() {},
  });
  assert.deepEqual(h.layer.getParams(), { windowDays: 7 });
  assert.equal(
    h.layer.getRowControls().chips.find((chip) => chip.active).label,
    '7D',
  );
  assert.equal(h.layer.setParams({ windowDays: 30 }), true);
  assert.deepEqual(h.layer.getParams(), { windowDays: 30 });
  assert.equal(
    h.layer.getRowControls().chips.find((chip) => chip.active).label,
    '30D',
  );
  h.layer.destroy();
});

test('SDPD source requests the selected age window', async () => {
  const urls = [];
  const source = createSdpdReportsSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ reports: [] }) };
    },
  });
  await source.getSnapshot();
  assert.equal(urls.at(-1), '/api/sdpd-reports?days=7');
  source.setWindowDays(90);
  await source.getSnapshot();
  assert.equal(urls.at(-1), '/api/sdpd-reports?days=90');
});

test('SDPD body completion honors cancellation even with an uncooperative transport', async () => {
  const abort = new AbortController();
  const source = createSdpdReportsSource({
    fetchImpl: async () => ({
      ok: true,
      json: async () => {
        abort.abort();
        return { reports: [] };
      },
    }),
  });
  await assert.rejects(source.getSnapshot({ signal: abort.signal }), {
    name: 'AbortError',
  });
});
