import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatLocationTagSnippet,
  normalizeLocationTags,
  suggestLocationTagId,
} from './records.js';
import { createLocationTagsSource } from './source.js';

const place = (overrides = {}) => ({
  id: 'petco-park',
  name: 'Petco Park',
  lat: 32.7073,
  lon: -117.1566,
  tags: ['home-base', 'ballpark', 'HOME-BASE'],
  note: 'Default startup view',
  color: '#f0a63c',
  ...overrides,
});

test('formatLocationTagSnippet is a place object that pastes into the tags file', () => {
  const snippet = formatLocationTagSnippet({ lat: 32.7073, lon: -117.1566 });
  assert.match(snippet, /^    \{/);
  const parsed = JSON.parse(snippet);
  assert.equal(parsed.id, suggestLocationTagId(32.7073, -117.1566));
  assert.equal(parsed.lat, 32.7073);
  assert.equal(parsed.lon, -117.1566);
  assert.ok(parsed.name);
  const [row] = normalizeLocationTags({ places: [parsed] });
  assert.equal(row.lat, 32.7073);
  assert.equal(row.lon, -117.1566);
  assert.equal(formatLocationTagSnippet({ lat: 99, lon: 0 }), null);
});

test('normalizeLocationTags keeps unique tags and optional color', () => {
  const [row] = normalizeLocationTags({ places: [place()] });
  assert.deepEqual(row, {
    stableId: 'petco-park',
    name: 'Petco Park',
    tags: ['home-base', 'ballpark'],
    note: 'Default startup view',
    color: '#f0a63c',
    lon: -117.1566,
    lat: 32.7073,
  });
});

test('normalizeLocationTags rejects invalid coordinates, blank names, and duplicate ids', () => {
  assert.equal(normalizeLocationTags({ places: [place({ lon: 200 })] }), null);
  assert.equal(
    normalizeLocationTags({ places: [place({ name: '  ' })] }),
    null,
  );
  assert.equal(
    normalizeLocationTags({ places: [place(), place({ name: 'Other' })] }),
    null,
  );
  assert.equal(normalizeLocationTags({}), null);
});

test('location tags source reads an injected file and honors cancellation', async () => {
  const source = createLocationTagsSource({
    payload: { places: [place()] },
  });
  const rows = await source.getSnapshot();
  assert.equal(rows[0].name, 'Petco Park');
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(source.getSnapshot({ signal: abort.signal }), {
    name: 'AbortError',
  });
});

test('location tags source prefers the local file over the committed template', async () => {
  const source = createLocationTagsSource({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ places: [place({ id: 'home', name: 'Home' })] }),
    }),
  });
  const rows = await source.getSnapshot();
  assert.equal(rows[0].name, 'Home');
});

test('location tags source falls back to the committed template', async () => {
  const source = createLocationTagsSource({
    fetchImpl: async () => ({ ok: false }),
  });
  const rows = await source.getSnapshot();
  assert.deepEqual(rows, []);
});
