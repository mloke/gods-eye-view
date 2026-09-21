import * as Cesium from 'cesium';

export const LOCATION_TAGS_OVERLAY_SOURCE_ID = 'location-tags';
export const LOCATION_TAGS_OVERLAY_COHORT_LIMIT = 96;
export const LOCATION_TAGS_OVERLAY_COLLISION_CAPACITY = 48;
export const DEFAULT_LOCATION_TAG_COLOR = '#f0a63c';

export function placeAccent(record) {
  return record?.color || DEFAULT_LOCATION_TAG_COLOR;
}

export function placeColor(record) {
  return Cesium.Color.fromCssColorString(placeAccent(record));
}

function placeDetails(record) {
  const details = [];
  if (record?.tags?.length) details.push(record.tags.join(' · '));
  if (record?.note) details.push(record.note);
  return details;
}

/** Ambient overlay label for one tagged place. */
export function createLocationTagOverlayEntry({ id, position, record }) {
  return {
    id: String(id),
    position,
    variant: 'label',
    title: record?.name || 'Tagged place',
    accent: placeAccent(record),
    priority: 1_000_000 + (record?.tags?.length || 0) * 10,
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    interactive: true,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 15,
    verticalOnly: true,
    placement: 'above',
  };
}

/** Selected card showing name, tags, and optional note. */
export function createLocationTagSelectedOverlayEntry({
  id,
  position,
  record,
}) {
  return {
    id: String(id),
    position,
    variant: 'card',
    cardStyle: 'tactical',
    title: record?.name || 'Tagged place',
    details: placeDetails(record),
    accent: placeAccent(record),
    priority: 4_000_000_000,
    collisionGroup: 'ambient-card',
    paintLane: 'ambient-card',
    interactive: true,
    selected: true,
    edgeFade: 'none',
    horizonCull: true,
    terrainOcclusion: false,
    gapPx: 20,
    placement: 'above',
    zIndex: 60,
  };
}

export function selectLocationTagOverlayCohort(
  entries,
  limit = LOCATION_TAGS_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(
    0,
    Math.min(
      LOCATION_TAGS_OVERLAY_COHORT_LIMIT,
      Math.floor(Number(limit) || 0),
    ),
  );
  if (!Array.isArray(entries) || cap === 0) return [];
  return entries
    .slice()
    .sort(
      (a, b) =>
        b.priority - a.priority || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, cap);
}

export function mapAnalystRecord(raw, index = 0) {
  const num = (v) => (Number.isFinite(v) ? v : null);
  const text = (v) => {
    const t = String(v ?? '').trim();
    return t || null;
  };
  return {
    id: text(raw?.id) || `TAG-${String(index).padStart(4, '0')}`,
    name: text(raw?.name),
    tags: Array.isArray(raw?.tags) ? raw.tags.join(', ') : text(raw?.tags),
    note: text(raw?.note),
    lat: num(raw?.lat),
    lon: num(raw?.lon),
  };
}

export {
  formatLocationTagSnippet,
  normalizeLocationTag,
  normalizeLocationTags,
  suggestLocationTagId,
} from './records.js';
