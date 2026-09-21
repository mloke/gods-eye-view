import { readResponseJsonCapped } from './common/http.js';
import {
  SDPD_FEATURE_LAYER_URL,
  SDPD_MAX_ROWS,
  SDPD_PAGE_SIZE,
  SDPD_WINDOW_DAYS,
  buildSdpdQueryUrl,
  formatSdpdQueryDate,
  normalizeSdpdFeaturePage,
  normalizeSdpdWindowDays,
} from '../../src/layers/sdpd/records.js';

const TTL_MS = 15 * 60_000;
const UPSTREAM_TIMEOUT_MS = 20_000;
const PAGE_MAX_BYTES = 4 * 1024 * 1024;

function windowDaysFromRequest(req) {
  const raw = typeof req?.url === 'string' ? req.url : '';
  try {
    return normalizeSdpdWindowDays(
      new URL(raw, 'http://127.0.0.1/api/sdpd-reports').searchParams.get(
        'days',
      ),
    );
  } catch {
    return SDPD_WINDOW_DAYS;
  }
}

/**
 * SDPD NIBRS offense proxy with a memory cache keyed by age window.
 * Upstream: the City of San Diego public FeatureServer used by the
 * Neighborhood Crime Data Explorer. Pages are bounded, redirects are
 * refused, and only the registered query URL is fetched.
 *
 * Routes:
 *   GET /api/sdpd-reports?days=7|30|90 →
 *     {fetchedAt, stale, ttlMs, windowDays, count, reports}
 */
export function sdpdReportsProxy({
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  /** @type {Map<number, {at: number, reports: Array<object>}>} */
  const cache = new Map();
  /** @type {Map<number, Promise<?{at: number, reports: Array<object>}>>} */
  const inflight = new Map();

  function buildPayload(entry, stale, windowDays) {
    return {
      fetchedAt: entry.at,
      stale,
      ttlMs: TTL_MS,
      windowDays,
      count: entry.reports.length,
      reports: entry.reports,
    };
  }

  async function fetchPage(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'gods-eye-view-sdpd-proxy/1.0',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        void upstream.body?.cancel?.().catch(() => {});
        throw new Error('SDPD upstream redirected');
      }
      if (!upstream.ok) throw new Error(`SDPD HTTP ${upstream.status}`);
      const payload = await readResponseJsonCapped(
        upstream,
        PAGE_MAX_BYTES,
        controller.signal,
      );
      const rows = normalizeSdpdFeaturePage(payload);
      if (!rows) throw new Error('Malformed SDPD upstream page');
      return { rows, exceeded: payload.exceededTransferLimit === true };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function refreshUpstream(windowDays) {
    const sinceDate = formatSdpdQueryDate(
      now() - windowDays * 24 * 60 * 60 * 1000,
    );
    if (!sinceDate) throw new Error('Invalid SDPD query date');
    const reports = [];
    let offset = 0;
    while (reports.length < SDPD_MAX_ROWS) {
      const remaining = SDPD_MAX_ROWS - reports.length;
      const url = buildSdpdQueryUrl({
        sinceDate,
        offset,
        recordCount: Math.min(SDPD_PAGE_SIZE, remaining),
      });
      if (!url || !url.startsWith(`${SDPD_FEATURE_LAYER_URL}/query?`))
        throw new Error('Refusing unregistered SDPD query');
      const { rows, exceeded } = await fetchPage(url);
      for (const row of rows) reports.push(row);
      if (!exceeded || rows.length < SDPD_PAGE_SIZE) break;
      offset += rows.length;
    }
    return { at: now(), reports };
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/sdpd-reports', async (req, res) => {
      const sendJson = (status, obj) => {
        if (res.headersSent) return;
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(obj));
      };
      const windowDays = windowDaysFromRequest(req);
      try {
        const entry = cache.get(windowDays);
        if (entry && now() - entry.at < TTL_MS) {
          sendJson(200, buildPayload(entry, false, windowDays));
          return;
        }
        if (!inflight.has(windowDays)) {
          inflight.set(
            windowDays,
            refreshUpstream(windowDays)
              .then((fresh) => {
                cache.set(windowDays, fresh);
                return fresh;
              })
              .catch((err) => {
                console.warn(
                  `[sdpd-proxy] refresh failed (${err?.message || err}) — serving cache if any`,
                );
                return null;
              })
              .finally(() => {
                inflight.delete(windowDays);
              }),
          );
        }
        const fresh = await inflight.get(windowDays);
        if (fresh) sendJson(200, buildPayload(fresh, false, windowDays));
        else if (entry) sendJson(200, buildPayload(entry, true, windowDays));
        else
          sendJson(502, { error: 'sdpd fetch failed and no cache available' });
      } catch (err) {
        console.warn('[sdpd-proxy] error:', err?.message || err);
        sendJson(500, { error: 'sdpd proxy error' });
      }
    });
  };

  return {
    name: 'sdpd-reports-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
