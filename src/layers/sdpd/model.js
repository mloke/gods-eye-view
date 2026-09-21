import * as Cesium from 'cesium';

export const SDPD_OVERLAY_SOURCE_ID = 'sdpd-reports';
export const SDPD_OVERLAY_COHORT_LIMIT = 96;
export const SDPD_OVERLAY_COLLISION_CAPACITY = 48;
export {
  SDPD_WINDOW_DAYS,
  SDPD_WINDOW_DAY_OPTIONS,
  normalizeSdpdWindowDays,
} from './records.js';

const VIOLENT_COLOR = Cesium.Color.fromCssColorString('#ff4d4d');
const PROPERTY_COLOR = Cesium.Color.fromCssColorString('#f0a63c');
const OTHER_COLOR = Cesium.Color.fromCssColorString('#6ec8ff');

/** Color by NIBRS class: violent, property, or other. */
export function reportColor(record) {
  if (record?.violent) return VIOLENT_COLOR;
  if (record?.property) return PROPERTY_COLOR;
  return OTHER_COLOR;
}

export function reportAccent(record) {
  return reportColor(record).toCssColorString();
}

function labelTitle(record) {
  return record?.offense || record?.category || 'SDPD report';
}

function formatOccurredOn(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms));
}

function reportDetails(record) {
  const details = [];
  const occurred = formatOccurredOn(record?.occurredOnMs);
  if (occurred) details.push(occurred);
  if (record?.neighborhood) details.push(record.neighborhood);
  if (record?.blockAddress) details.push(record.blockAddress);
  if (record?.caseNumber) details.push(`Case ${record.caseNumber}`);
  details.push('Hundred-block location · informational only');
  return details;
}

function reportPriority(record) {
  const recency = Number.isFinite(record?.occurredOnMs)
    ? Math.max(0, Math.floor(record.occurredOnMs / 1000))
    : 0;
  const weight = record?.violent
    ? 2_000_000_000
    : record?.property
      ? 1_000_000_000
      : 0;
  return weight + recency;
}

/** Ambient overlay label for one offense. */
export function createSdpdOverlayEntry({ id, position, record }) {
  return {
    id: String(id),
    position,
    variant: 'label',
    title: labelTitle(record),
    accent: reportAccent(record),
    priority: reportPriority(record),
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

/** Selected overlay card with offense, date, neighborhood, and case number. */
export function createSdpdSelectedOverlayEntry({ id, position, record }) {
  return {
    id: String(id),
    position,
    variant: 'card',
    cardStyle: 'tactical',
    title: labelTitle(record),
    details: reportDetails(record),
    accent: reportAccent(record),
    priority: reportPriority(record) + 3_000_000_000,
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

/** Keep violent and recent reports, with stable identity as the tie-break. */
export function selectSdpdOverlayCohort(
  entries,
  limit = SDPD_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(
    0,
    Math.min(SDPD_OVERLAY_COHORT_LIMIT, Math.floor(Number(limit) || 0)),
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

/**
 * Map one report's plain values to a JSON-safe analyst record.
 * @param {object|null|undefined} raw
 * @param {number} [index=0]
 */
export function mapAnalystRecord(raw, index = 0) {
  const num = (v) => (Number.isFinite(v) ? v : null);
  const text = (v) => {
    const t = String(v ?? '').trim();
    return t || null;
  };
  return {
    id: text(raw?.id) || `SDPD-${String(index).padStart(4, '0')}`,
    offense: text(raw?.offense),
    category: text(raw?.category),
    neighborhood: text(raw?.neighborhood),
    blockAddress: text(raw?.blockAddress),
    crimeAgainst: text(raw?.crimeAgainst),
    lat: num(raw?.lat),
    lon: num(raw?.lon),
    timeMs: num(raw?.occurredOnMs ?? raw?.time),
    violent: raw?.violent === true,
    property: raw?.property === true,
  };
}

export {
  normalizeSdpdFeaturePage,
  normalizeSdpdRecord,
  normalizeSdpdRecords,
} from './records.js';
