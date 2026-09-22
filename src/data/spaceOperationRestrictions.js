/**
 * Space-operation air and sea closures.
 *
 * FAA Space Operations TFRs are FDC NOTAMs. Their web text publishes a center
 * and a nautical-mile radius. USCG Broadcast Notices to Mariners on the launch
 * coasts publish rocket-hazard polygons. Notices that are only gun exercises,
 * generic hazards, or cancellations are left out. Coordinates come from the
 * published text; missing geometry is dropped rather than invented.
 */

const NM_TO_M = 1852;
const MONTHS = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

export const MAX_SPACE_TFR_DETAILS = 12;
export const SPACE_NOTICE_BUFFER_M = 25_000;
export const SPACE_NOTICE_LEAD_MS = 12 * 60 * 60 * 1000;
export const SPACE_NOTICE_LAG_MS = 6 * 60 * 60 * 1000;
export const SPACE_NOTICE_LOOKAHEAD_MS = 32 * 24 * 60 * 60 * 1000;

const SPACE_OPERATION_RE =
  /\b(?:SPACE OPERATIONS|SPACE LAUNCH|ROCKET LAUNCH(?:ES)?|COMMERCIAL SPACE)\b/i;
const TFR_NOTAM_ID_RE = /^\d{1,4}\/\d{1,6}$/;

export function isTfrNotamId(value) {
  return TFR_NOTAM_ID_RE.test(String(value || '').trim());
}

export function selectSpaceOperationTfrs(list, limit = MAX_SPACE_TFR_DETAILS) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (row) =>
        String(row?.type || '')
          .trim()
          .toUpperCase() === 'SPACE OPERATIONS' && isTfrNotamId(row?.notam_id),
    )
    .slice(0, limit);
}

export function parseTfrWebText({
  notamId,
  html,
  description = '',
  facility = '',
  state = '',
} = {}) {
  const id = String(notamId || '').trim();
  if (!isTfrNotamId(id)) return null;
  const text = htmlToPlain(html);
  if (!SPACE_OPERATION_RE.test(text)) return null;
  const areas = tfrCircles(text);
  if (!areas.length) return null;
  const startsAt = tfrStamp(text, 'Beginning Date and Time');
  const endsAt = tfrStamp(text, 'Ending Date and Time');
  const reason = labeledField(text, 'Reason for NOTAM');
  const place = [description, facility, state].filter(Boolean).join(' · ');
  return {
    id: `tfr:${id}`,
    kind: 'tfr',
    title: clip(description || `FDC ${id}`, 180),
    summary: clip(reason || 'Space operations temporary flight restriction', 240),
    location: clip(place, 180),
    notamId: `FDC ${id}`,
    startsAt,
    endsAt,
    windows: startsAt && endsAt ? [{ startsAt, endsAt }] : [],
    publishedAt: null,
    url: `https://tfr.faa.gov/tfr3/?page=detail_${id.replace('/', '_')}`,
    areas,
    source: 'FAA TFR',
  };
}

export function parseBnmRss(xml) {
  const items = rssItems(xml);
  const cancelled = new Set(
    items
      .map((block) => rssTag(block, 'title'))
      .filter((title) => isCancellation(title))
      .map((title) => bnmKey(title))
      .filter(Boolean),
  );
  const notices = [];
  const seen = new Set();
  for (const block of items) {
    const notice = parseBnmItem(block);
    if (!notice || cancelled.has(bnmKey(notice.title)) || seen.has(notice.id))
      continue;
    seen.add(notice.id);
    notices.push(notice);
  }
  return notices;
}

export function buildSpaceOperationSnapshot({
  webTexts = [],
  rssDocuments = [],
  now = new Date(),
} = {}) {
  const notices = [];
  const seen = new Set();
  for (const entry of webTexts) {
    const notice = parseTfrWebText(entry);
    if (!notice || seen.has(notice.id)) continue;
    seen.add(notice.id);
    notices.push(notice);
  }
  for (const xml of rssDocuments) {
    for (const notice of parseBnmRss(xml)) {
      if (seen.has(notice.id)) continue;
      seen.add(notice.id);
      notices.push(notice);
    }
  }
  return {
    fetchedAt: new Date(now).toISOString(),
    notices: displayableSpaceNotices(notices, now),
  };
}

export function displayableSpaceNotices(notices, now = new Date()) {
  const instant = new Date(now).getTime();
  if (!Number.isFinite(instant)) return [];
  const from = instant - SPACE_NOTICE_LAG_MS;
  const to = instant + SPACE_NOTICE_LOOKAHEAD_MS;
  return (Array.isArray(notices) ? notices : []).filter((notice) => {
    if (!notice?.areas?.length) return false;
    const windows = noticeWindows(notice);
    if (!windows.length) {
      const published = Date.parse(notice.publishedAt || '');
      return Number.isFinite(published) && Math.abs(published - instant) <= 5 * 86400000;
    }
    return windows.some((window) => {
      const start = Date.parse(window.startsAt || '');
      const end = Date.parse(window.endsAt || '');
      if (!Number.isFinite(start) && !Number.isFinite(end)) return false;
      const open = Number.isFinite(start) ? start : end;
      const close = Number.isFinite(end) ? end : start;
      return close >= from && open <= to;
    });
  });
}

export function restrictionMatchesLaunch(notice, launch) {
  if (!notice?.areas?.length || !launch) return false;
  if (!Number.isFinite(launch.lat) || !Number.isFinite(launch.lon)) return false;
  if (!notice.areas.some((area) => areaCovers(area, launch.lat, launch.lon)))
    return false;
  const windows = noticeWindows(notice);
  const launchMs = Date.parse(launch.launchTime || '');
  if (!windows.length) return true;
  if (!Number.isFinite(launchMs)) return false;
  return windows.some((window) => {
    const start = Date.parse(window.startsAt || '');
    const end = Date.parse(window.endsAt || '');
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return (
      launchMs >= start - SPACE_NOTICE_LEAD_MS &&
      launchMs <= end + SPACE_NOTICE_LAG_MS
    );
  });
}

export function noticesForLaunch(notices, launch) {
  return (Array.isArray(notices) ? notices : []).filter((notice) =>
    restrictionMatchesLaunch(notice, launch),
  );
}

function noticeWindows(notice) {
  if (Array.isArray(notice?.windows) && notice.windows.length) return notice.windows;
  if (notice?.startsAt || notice?.endsAt)
    return [{ startsAt: notice.startsAt || null, endsAt: notice.endsAt || null }];
  return [];
}

function areaCovers(area, lat, lon) {
  if (area?.type === 'circle') {
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon)) return false;
    return haversineM(lat, lon, area.lat, area.lon) <= area.radiusM + SPACE_NOTICE_BUFFER_M;
  }
  if (area?.type !== 'polygon' || !Array.isArray(area.positions)) return false;
  if (pointInPolygon(lat, lon, area.positions)) return true;
  return area.positions.some(
    (point) =>
      Number.isFinite(point?.lat) &&
      Number.isFinite(point?.lon) &&
      haversineM(lat, lon, point.lat, point.lon) <= SPACE_NOTICE_BUFFER_M,
  );
}

function tfrCircles(text) {
  const re =
    /Latitude:\s*(\d+)\s*[°º]\s*(\d+)'\s*(\d+(?:\.\d+)?)"\s*([NS])\s*,\s*Longitude:\s*(\d+)\s*[°º]\s*(\d+)'\s*(\d+(?:\.\d+)?)"\s*([EW])\)?\s*Radius:\s*([\d.]+)\s*nautical miles/gi;
  const areas = [];
  let match;
  while ((match = re.exec(text))) {
    const lat = signedDms(match[1], match[2], match[3], match[4]);
    const lon = signedDms(match[5], match[6], match[7], match[8]);
    const circle = boundedCircle(lat, lon, match[9]);
    if (circle) areas.push(circle);
  }
  return areas;
}

function parseBnmItem(block) {
  const title = clip(rssTag(block, 'title').replace(/\s+/g, ' '), 220);
  if (!title || isCancellation(title)) return null;
  const plain = htmlToPlain(rssTag(block, 'description'));
  if (!SPACE_OPERATION_RE.test(`${title}\n${plain}`)) return null;
  const areas = hazardPolygons(plain);
  if (!areas.length) return null;
  const windows = hazardWindows(plain);
  const key = bnmKey(title) || title;
  const published = Date.parse(rssTag(block, 'pubDate'));
  return {
    id: `bnm:${key}`,
    kind: 'ship',
    title,
    summary: clip(plain, 240),
    location: title,
    notamId: null,
    startsAt: windows[0]?.startsAt || null,
    endsAt: windows.at(-1)?.endsAt || windows[0]?.endsAt || null,
    windows,
    publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
    url: httpsUrl(rssTag(block, 'link')),
    areas,
    source: 'USCG Broadcast Notice to Mariners',
  };
}

function hazardPolygons(text) {
  const sectionRe = /\b[A-Z]\.\s*FROM\b([\s\S]*?)\bTO BEGINNING\b/gi;
  const areas = [];
  let match;
  while ((match = sectionRe.exec(text))) {
    const polygon = boundedPolygon(coordinatesIn(match[1]));
    if (polygon) areas.push(polygon);
  }
  if (areas.length) return areas;
  const polygon = boundedPolygon(coordinatesIn(text));
  return polygon ? [polygon] : [];
}

function hazardWindows(text) {
  const re =
    /(\d{1,2})\/(\d{4})\s+([A-Z]{3})\s+(\d{2})\s+TO\s+(\d{1,2})\/(\d{4})\s+([A-Z]{3})\s+(\d{2})/gi;
  const windows = [];
  const seen = new Set();
  let match;
  while ((match = re.exec(text))) {
    const startsAt = bnmInstant(match[1], match[2], match[3], match[4]);
    const endsAt = bnmInstant(match[5], match[6], match[7], match[8]);
    if (!startsAt || !endsAt || Date.parse(endsAt) < Date.parse(startsAt)) continue;
    const key = `${startsAt}/${endsAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    windows.push({ startsAt, endsAt });
  }
  return windows;
}

function coordinatesIn(text) {
  const re =
    /(\d{1,3})-(\d{2})(?:-(\d{2}(?:\.\d+)?))?([NS])\s*\/\s*(\d{1,3})-(\d{2})(?:-(\d{2}(?:\.\d+)?))?([EW])/g;
  const positions = [];
  let match;
  while ((match = re.exec(text))) {
    const lat = signedDms(match[1], match[2], match[3] || 0, match[4]);
    const lon = signedDms(match[5], match[6], match[7] || 0, match[8]);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      continue;
    positions.push({ lat, lon });
  }
  return positions;
}

function boundedCircle(lat, lon, radiusNm) {
  const radiusM = Number(radiusNm) * NM_TO_M;
  if (
    lat == null ||
    lon == null ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !(radiusM > 0) ||
    radiusM > 500 * NM_TO_M
  )
    return null;
  return { type: 'circle', lat, lon, radiusM };
}

function boundedPolygon(positions) {
  if (!positions || positions.length < 3 || positions.length > 80) return null;
  const lats = positions.map((point) => point.lat);
  const lons = positions.map((point) => point.lon);
  if (Math.max(...lats) - Math.min(...lats) > 40) return null;
  if (Math.max(...lons) - Math.min(...lons) > 40) return null;
  return { type: 'polygon', positions };
}

function signedDms(deg, minutes, seconds, hemisphere) {
  const value =
    Number(deg) + Number(minutes) / 60 + Number(seconds || 0) / 3600;
  if (!Number.isFinite(value)) return null;
  const sign = hemisphere === 'S' || hemisphere === 'W' ? -1 : 1;
  return sign * value;
}

function bnmInstant(dayText, hhmm, monthText, yearText) {
  const month = MONTHS[String(monthText || '').toUpperCase()];
  const day = Number(dayText);
  const year = Number(yearText);
  const hours = Number(String(hhmm).slice(0, 2));
  const minutes = Number(String(hhmm).slice(2, 4));
  if (
    month == null ||
    !Number.isInteger(day) ||
    !Number.isInteger(year) ||
    hours > 23 ||
    minutes > 59 ||
    String(hhmm).length !== 4
  )
    return null;
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;
  const date = new Date(Date.UTC(fullYear, month, day, hours, minutes));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.toISOString();
}

function tfrStamp(text, label) {
  const raw = labeledField(text, label);
  const match = raw.match(/([A-Za-z]+ \d{1,2}, \d{4}) at (\d{4}) UTC/i);
  if (!match || match[2].length !== 4) return null;
  const ms = Date.parse(
    `${match[1]} ${match[2].slice(0, 2)}:${match[2].slice(2)}:00 UTC`,
  );
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function labeledField(text, label) {
  const match = text.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function htmlToPlain(html) {
  return String(html || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#xBA;|&#186;|&deg;/gi, '°')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function rssItems(xml) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(String(xml || '')))) items.push(match[1]);
  return items;
}

function rssTag(block, name) {
  const match = String(block || '').match(
    new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'),
  );
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

function isCancellation(title) {
  return /^\s*CANCELLATION\b/i.test(title);
}

function bnmKey(title) {
  const match = String(title || '').match(/BNM\s+(\d+-\d+)/i);
  return match ? match[1].toUpperCase() : '';
}

function clip(value, max) {
  const flat = String(value || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.href;
  } catch {
    return '';
  }
}

function pointInPolygon(lat, lon, positions) {
  let inside = false;
  for (let index = 0, previous = positions.length - 1; index < positions.length; previous = index++) {
    const current = positions[index];
    const prior = positions[previous];
    if (!Number.isFinite(current?.lat) || !Number.isFinite(prior?.lat)) continue;
    const crosses =
      current.lat > lat !== prior.lat > lat &&
      lon <
        ((prior.lon - current.lon) * (lat - current.lat)) / (prior.lat - current.lat) +
          current.lon;
    if (crosses) inside = !inside;
  }
  return inside;
}

function haversineM(lat1, lon1, lat2, lon2) {
  const radius = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}
