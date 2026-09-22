import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import {
  celestrakProxy,
  rocketLaunchesProxy,
  spaceOperationRestrictionsProxy,
  launchLibraryRequestHeaders,
  LL2_CACHE_TTL_MS,
} from 'gods-eye-view/server/providers/space';
import {
  celestrakTleUrl,
  launchLibraryRecentUrl,
} from 'gods-eye-view/sources/space';
import * as compatibility from '../../server/providers/local.js';

function install(plugin, preview = false) {
  const routes = new Map();
  plugin[preview ? 'configurePreviewServer' : 'configureServer']({
    middlewares: {
      use(route, handler) {
        routes.set(route, handler);
      },
    },
  });
  return async (route, url = '/', method = 'GET') => {
    const res = {
      headersSent: false,
      writeHead(status, headers) {
        Object.assign(this, { status, headers, headersSent: true });
      },
      end(body) {
        this.body = body;
      },
    };
    await routes.get(route)({ url, method }, res);
    return res;
  };
}
function isolateDisk(t) {
  t.mock.method(fsp, 'readFile', async () => {
    throw Error('no cache');
  });
  t.mock.method(fsp, 'stat', async () => {
    throw Error('no cache');
  });
  t.mock.method(fsp, 'mkdir', async () => {});
  t.mock.method(fsp, 'writeFile', async () => {});
}

test('portable requests keep fixed origins, encode group data and preserve the 30-day UTC window', () => {
  const tle = celestrakTleUrl('stations&FORMAT=json');
  assert.equal(tle.origin, 'https://celestrak.org');
  assert.equal(tle.pathname, '/NORAD/elements/gp.php');
  assert.equal(tle.searchParams.get('GROUP'), 'stations&FORMAT=json');
  assert.equal(tle.searchParams.get('FORMAT'), 'tle');
  const end = new Date('2026-03-01T12:34:56.000Z');
  const url = launchLibraryRecentUrl(end);
  assert.equal(url.origin, 'https://ll.thespacedevs.com');
  assert.equal(url.pathname, '/2.3.0/launches/');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    net__gte: '2026-01-30T12:34:56.000Z',
    net__lte: '2026-03-01T12:34:56.000Z',
    limit: '100',
    mode: 'detailed',
  });
  assert.equal(end.toISOString(), '2026-03-01T12:34:56.000Z');
});

test('compatibility exports retain the same LL2 header helper and TTL', () => {
  assert.equal(
    compatibility.launchLibraryRequestHeaders,
    launchLibraryRequestHeaders,
  );
  assert.equal(compatibility.LL2_CACHE_TTL_MS, LL2_CACHE_TTL_MS);
});

test('exported CelesTrak plugin coalesces refreshes, retains stale TLEs, and reads disk in a new instance', async (t) => {
  isolateDisk(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', () => {});
  const tle = 'ISS\n1 25544U fixture\n2 25544 fixture';
  let calls = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    assert.equal(new URL(url).searchParams.get('GROUP'), 'stations');
    await gate;
    return new Response(tle);
  });
  const request = install(celestrakProxy());
  assert.equal((await request('/api/celestrak', '/../bad')).status, 400);
  assert.equal(calls, 0);
  const first = request('/api/celestrak', '/stations');
  const second = request('/api/celestrak', '/stations');
  release();
  for (const res of await Promise.all([first, second]))
    assert.equal(res.body, tle);
  assert.equal(calls, 1);
  assert.equal(
    (await request('/api/celestrak', '/stations')).headers['x-tle-cache'],
    'HIT',
  );
  now += 6 * 3600_000;
  t.mock.method(globalThis, 'fetch', async () => new Response('not a TLE'));
  const stale = await request('/api/celestrak', '/stations');
  assert.equal(stale.body, tle);
  assert.equal(stale.headers['x-tle-cache'], 'STALE-ERROR');
  t.mock.method(fsp, 'readFile', async () =>
    JSON.stringify({ at: now, body: tle }),
  );
  t.mock.method(globalThis, 'fetch', async () => {
    throw Error('fresh disk must prevent fetch');
  });
  const disk = await install(celestrakProxy())('/api/celestrak', '/stations');
  assert.equal(disk.headers['x-tle-cache'], 'HIT');
  assert.equal(disk.body, tle);
});

for (const preview of [false, true])
  test(`exported launch plugin preserves optional server auth and cache in ${preview ? 'preview' : 'development'}`, async (t) => {
    isolateDisk(t);
    const prior = process.env.LL2_API_TOKEN;
    t.after(() => {
      if (prior === undefined) delete process.env.LL2_API_TOKEN;
      else process.env.LL2_API_TOKEN = prior;
    });
    process.env.LL2_API_TOKEN = ' fixture-token ';
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      calls++;
      assert.equal(url.searchParams.get('limit'), '100');
      assert.equal(options.headers.Authorization, 'Token fixture-token');
      return Response.json({ results: [{ id: 'launch-fixture' }] });
    });
    const request = install(rocketLaunchesProxy(), preview);
    assert.equal((await request('/api/launches', '/', 'POST')).status, 405);
    const first = await request('/api/launches');
    assert.equal(first.headers['X-GEV-Cache'], 'MISS');
    assert.doesNotMatch(first.body, /fixture-token/);
    const hit = await request('/api/launches');
    assert.equal(hit.headers['X-GEV-Cache'], 'HIT');
    assert.equal(hit.body, first.body);
    assert.equal(calls, 1);
  });

test('space-operation proxy keeps rocket closures and drops unrelated hazards', async (t) => {
  isolateDisk(t);
  const clock = Date.parse('2026-09-22T12:00:00.000Z');
  t.mock.method(Date, 'now', () => clock);
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const href = String(url);
    seen.push(href);
    if (href.endsWith('/exportTfrList')) {
      return Response.json([
        {
          notam_id: '6/4325',
          type: 'SPACE OPERATIONS',
          description: 'BLACK ROCK, NV',
          facility: 'ZLC',
          state: 'NV',
        },
        { notam_id: '6/4585', type: 'HAZARDS', description: 'Brownsville' },
      ]);
    }
    if (href.includes('getWebText')) {
      return Response.json([
        {
          text: 'Reason for NOTAM : TO PROVIDE A SAFE ENVIRONMENT FOR ROCKET LAUNCH ACTIVITY Beginning Date and Time : September 27, 2026 at 1500 UTC Ending Date and Time : September 28, 2026 at 0100 UTC (Latitude: 40&#xBA;50&#39;42"N, Longitude: 119&#xBA;06&#39;44"W) Radius: 15 nautical miles',
        },
      ]);
    }
    return new Response(
      '<rss><item><title>SAFETY/CAPE/SPACE OPERATIONS/BNM 9100-26</title><description>SPACE LAUNCH OPERATIONS A. FROM 28-36-31N/080-35-38W TO 28-39-00N/080-29-00W TO 28-31-00N/080-33-17W TO BEGINNING 22/1200 SEP 26 TO 22/1800 SEP 26.</description></item><item><title>SAFETY/VIRGINIA CAPES/HAZ OPS/GUNEX/BNM 0416-26</title><description>NAVY GUNFIRE A. FROM 36-00-00N/075-00-00W TO 36-10-00N/074-40-00W TO 35-50-00N/074-40-00W TO BEGINNING 22/1200 SEP 26 TO 22/1800 SEP 26.</description></item></rss>',
      { headers: { 'Content-Type': 'application/rss+xml' } },
    );
  });
  const request = install(spaceOperationRestrictionsProxy());
  assert.equal(
    (await request('/api/space-restrictions', '/', 'POST')).status,
    405,
  );
  const first = await request('/api/space-restrictions');
  assert.equal(first.status, 200);
  assert.equal(first.headers['X-GEV-Cache'], 'MISS');
  const snapshot = JSON.parse(first.body);
  assert.deepEqual(
    snapshot.notices.map((notice) => notice.id).sort(),
    ['bnm:9100-26', 'tfr:6/4325'],
  );
  assert.equal(snapshot.notices.find((notice) => notice.id === 'tfr:6/4325').areas[0].radiusM, 15 * 1852);
  assert.doesNotMatch(first.body, /GUNEX|Brownsville|6\/4585/);
  assert.equal(seen.filter((href) => href.includes('getWebText')).length, 1);
  const hit = await request('/api/space-restrictions');
  assert.equal(hit.headers['X-GEV-Cache'], 'HIT');
  assert.equal(hit.body, first.body);
});
