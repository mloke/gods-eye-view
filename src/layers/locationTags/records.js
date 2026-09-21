export const LOCATION_TAGS_MAX_ROWS = 200;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function text(value, max = 80) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function tags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const tag = text(item, 32);
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

/** Validate one place from the personal tags file. */
export function normalizeLocationTag(row, index = 0) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const lon = Number(row.lon);
  const lat = Number(row.lat);
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return null;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  const name = text(row.name, 80);
  if (!name) return null;
  const color = text(row.color, 7);
  return {
    stableId: text(row.id, 64) || `place-${index + 1}`,
    name,
    tags: tags(row.tags),
    note: text(row.note, 160),
    color: color && HEX_COLOR.test(color) ? color : null,
    lon,
    lat,
  };
}

const COORD_DECIMALS = 5;

function roundCoord(value) {
  const scale = 10 ** COORD_DECIMALS;
  return Math.round(Number(value) * scale) / scale;
}

function coordKey(value, northOrEast, southOrWest) {
  const rounded = roundCoord(value);
  const hemisphere = rounded < 0 ? southOrWest : northOrEast;
  return `${hemisphere}${Math.abs(rounded).toFixed(COORD_DECIMALS)}`;
}

/** Build a unique id from a picked coordinate. */
export function suggestLocationTagId(lat, lon) {
  return `place-${coordKey(lat, 'n', 's')}-${coordKey(lon, 'e', 'w')}`;
}

/**
 * JSON object ready to paste into config/location-tags.json `places`.
 * Indented to sit in the existing file's array.
 */
export function formatLocationTagSnippet({ lat, lon }) {
  const latitude = roundCoord(lat);
  const longitude = roundCoord(lon);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  const snippet = JSON.stringify(
    {
      id: suggestLocationTagId(latitude, longitude),
      name: `${latitude.toFixed(COORD_DECIMALS)}, ${longitude.toFixed(COORD_DECIMALS)}`,
      lat: latitude,
      lon: longitude,
      tags: [],
      note: '',
    },
    null,
    2,
  );
  return snippet
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

/** Validate the personal tags file before it can replace displayed places. */
export function normalizeLocationTags(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.places)
      ? payload.places
      : null;
  if (!rows) return null;
  const normalized = [];
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const record = normalizeLocationTag(row, index);
    if (!record) return null;
    if (ids.has(record.stableId)) return null;
    ids.add(record.stableId);
    normalized.push(record);
    if (normalized.length >= LOCATION_TAGS_MAX_ROWS) break;
  }
  return normalized;
}
