import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RADAR_TILE_HOST,
  acceptRadarSnapshot,
  normalizeRadarCatalog,
  radarTileTemplate,
} from './radar.js';

const catalog = {
  host: RADAR_TILE_HOST,
  radar: {
    past: [
      { time: 1000, path: '/v2/radar/aaa' },
      { time: 1600, path: '/v2/radar/ccc' },
      { time: 1300, path: '/v2/radar/bbb' },
    ],
    nowcast: [{ time: 1900, path: '/v2/radar/forecast' }],
  },
};

test('radar tiles stay on the RainViewer cache host', () => {
  assert.equal(
    radarTileTemplate('/v2/radar/abc123'),
    `${RADAR_TILE_HOST}/v2/radar/abc123/256/{z}/{x}/{y}/1/1_1.png`,
  );
  assert.equal(radarTileTemplate('/v2/radar/../secret'), null);
  assert.equal(radarTileTemplate('https://evil.example/v2/radar/abc'), null);
});

test('a catalog keeps observed frames in time order and drops forecasts', () => {
  const normalized = normalizeRadarCatalog(catalog);
  assert.deepEqual(
    normalized.frames.map((frame) => frame.path),
    ['/v2/radar/aaa', '/v2/radar/bbb', '/v2/radar/ccc'],
  );
  assert.equal(normalized.latestAt, '1970-01-01T00:26:40.000Z');
  assert.equal(normalized.frames[2].tileUrl.includes('{z}/{x}/{y}'), true);
  assert.equal(normalizeRadarCatalog({ host: 'https://evil.example', radar: catalog.radar }), null);
  assert.equal(
    normalizeRadarCatalog({ host: RADAR_TILE_HOST, radar: { past: [] } }),
    null,
  );
});

test('the proxy frame list is accepted and its tile URL is rebuilt', () => {
  const snapshot = acceptRadarSnapshot({
    status: 'ready',
    host: 'https://evil.example',
    frames: [
      {
        time: 1600,
        path: '/v2/radar/ccc',
        tileUrl: 'https://evil.example/steal.png',
        observedAt: 'nope',
      },
    ],
  });
  assert.equal(
    snapshot.frames[0].tileUrl,
    `${RADAR_TILE_HOST}/v2/radar/ccc/256/{z}/{x}/{y}/1/1_1.png`,
  );
  assert.equal(acceptRadarSnapshot({ samples: [{ temperatureC: 18 }] }), null);
});

test('only the newest frames are kept', () => {
  const past = Array.from({ length: 12 }, (_, index) => ({
    time: 1_000 + index * 600,
    path: `/v2/radar/f${index}`,
  }));
  const normalized = normalizeRadarCatalog({
    host: RADAR_TILE_HOST,
    radar: { past },
  });
  assert.equal(normalized.frames.length, 8);
  assert.equal(normalized.frames[0].path, '/v2/radar/f4');
  assert.equal(normalized.frames.at(-1).path, '/v2/radar/f11');
});
