import path from 'node:path';
import { promises as fsp } from 'node:fs';
import {
  readResponseTextCapped,
  coalesceProxyRequest,
} from '../common/http.js';
import {
  tfrListUrl,
  tfrWebTextUrl,
  uscgLaunchCoastBnmFeeds,
} from '../../../src/data/spaceProviderRequests.js';
import {
  buildSpaceOperationSnapshot,
  isTfrNotamId,
  selectSpaceOperationTfrs,
} from '../../../src/data/spaceOperationRestrictions.js';

export const SPACE_RESTRICTION_CACHE_TTL_MS = 15 * 60_000;

const UPSTREAM_HEADERS = {
  Accept: 'application/json, application/rss+xml, application/xml, text/xml',
  'User-Agent': 'gods-eye-view',
};

/**
 * Proxy FAA Space Operations TFRs and launch-coast USCG hazard notices.
 * The browser never calls those origins directly. Parsed geometry is cached
 * for 15 minutes; a failed refresh keeps the last good snapshot.
 */
export function spaceOperationRestrictionsProxy() {
  const ttlMs = SPACE_RESTRICTION_CACHE_TTL_MS;
  const maxListBytes = 2 * 1024 * 1024;
  const maxDetailBytes = 512 * 1024;
  const maxRssBytes = 3 * 1024 * 1024;
  const maxDiskCacheBytes = 4 * 1024 * 1024;
  const cachePath = path.join(
    process.cwd(),
    '.gev-cache',
    'space-operation-restrictions.json',
  );
  let cache = null;
  let diskLoaded = false;
  const inFlight = new Map();

  async function loadDiskCache() {
    if (diskLoaded) return;
    diskLoaded = true;
    try {
      const stat = await fsp.stat(cachePath);
      if (stat.size > maxDiskCacheBytes) throw new Error('cache file too large');
      const parsed = JSON.parse(await fsp.readFile(cachePath, 'utf8'));
      if (Number.isFinite(parsed?.at) && validSnapshot(parsed.body)) cache = parsed;
    } catch {
      /* first run or invalid cache */
    }
  }

  async function saveDiskCache(entry) {
    try {
      await fsp.mkdir(path.dirname(cachePath), { recursive: true });
      await fsp.writeFile(cachePath, JSON.stringify(entry), 'utf8');
    } catch {
      console.warn('[space-restrictions-proxy] cache write failed');
    }
  }

  function send(res, status, body, cacheState) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': status === 200 ? 'public, max-age=900' : 'no-store',
      'X-GEV-Cache': cacheState,
    });
    res.end(body);
  }

  async function refreshUpstream() {
    let listOk = false;
    let list = [];
    let listStatus = 502;
    try {
      list = await readJson(tfrListUrl(), maxListBytes);
      listOk = Array.isArray(list);
      if (!listOk) list = [];
    } catch (error) {
      listStatus = Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : 502;
    }
    const selected = selectSpaceOperationTfrs(list);
    const webTexts = (
      await mapPool(selected, 4, async (row) => {
        if (!isTfrNotamId(row.notam_id)) return null;
        const payload = await readJson(tfrWebTextUrl(row.notam_id), maxDetailBytes);
        const html = Array.isArray(payload) ? payload[0]?.text : payload?.text;
        if (!html) return null;
        return {
          notamId: row.notam_id,
          html,
          description: row.description,
          facility: row.facility,
          state: row.state,
        };
      })
    ).filter(Boolean);
    let rssOk = false;
    const rssDocuments = [];
    await mapPool(uscgLaunchCoastBnmFeeds(), 5, async (url) => {
      try {
        rssDocuments.push(await readText(url, maxRssBytes));
        rssOk = true;
      } catch {
        /* one district feed can fail without dropping the others */
      }
    });
    if (!listOk && !rssOk) {
      const error = new Error('space restriction feeds unavailable');
      error.upstreamStatus = listStatus;
      throw error;
    }
    const snapshot = buildSpaceOperationSnapshot({
      webTexts,
      rssDocuments,
      now: new Date(Date.now()),
    });
    const body = JSON.stringify(snapshot);
    const fresh = { at: Date.now(), body };
    cache = fresh;
    void saveDiskCache(fresh);
    return fresh;
  }

  function install(middlewares) {
    middlewares.use('/api/space-restrictions', async (req, res) => {
      if (req.method !== 'GET') {
        send(res, 405, JSON.stringify({ error: 'Method Not Allowed' }), 'NONE');
        return;
      }
      await loadDiskCache();
      const now = Date.now();
      if (cache && now - cache.at < ttlMs) {
        send(res, 200, cache.body, 'HIT');
        return;
      }
      const stale = cache;
      const request = coalesceProxyRequest(
        inFlight,
        'space-restrictions',
        refreshUpstream,
      );
      try {
        const fresh = await request.promise;
        send(res, 200, fresh.body, request.shared ? 'INFLIGHT' : 'MISS');
      } catch (error) {
        const status = Number.isInteger(error?.upstreamStatus)
          ? error.upstreamStatus
          : 502;
        if (!request.shared)
          console.warn(
            `[space-restrictions-proxy] refresh failed (HTTP ${status})${stale ? ' — serving stale cache' : ''}`,
          );
        if (stale) {
          send(res, 200, stale.body, 'STALE-ERROR');
          return;
        }
        send(
          res,
          status,
          JSON.stringify({ error: 'Space operation restrictions unavailable' }),
          'NONE',
        );
      }
    });
  }

  return {
    name: 'space-operation-restrictions-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

async function readJson(url, maxBytes) {
  const text = await readText(url, maxBytes);
  return JSON.parse(text);
}

async function readText(url, maxBytes) {
  const upstream = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: UPSTREAM_HEADERS,
  });
  const text = await readResponseTextCapped(upstream, maxBytes);
  if (!upstream.ok) {
    const error = new Error(`upstream HTTP ${upstream.status}`);
    error.upstreamStatus = upstream.status;
    throw error;
  }
  return text;
}

function validSnapshot(body) {
  if (typeof body !== 'string') return false;
  try {
    const parsed = JSON.parse(body);
    return Boolean(parsed && Array.isArray(parsed.notices));
  } catch {
    return false;
  }
}

async function mapPool(items, limit, visit) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          results[index] = await visit(items[index], index);
        } catch {
          results[index] = null;
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}
