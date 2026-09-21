export const SDPD_FEATURE_LAYER_URL =
  'https://webmaps.sandiego.gov/arcgis/rest/services/SDPD/SDPD_NIBRS_Crime_Offenses_Geo/FeatureServer/0';
export const SDPD_WINDOW_DAYS = 7;
export const SDPD_WINDOW_DAY_OPTIONS = Object.freeze([1, 7, 30, 90]);

/** Allowlist a report-age window. Unknown values fall back to 7 days. */
export function normalizeSdpdWindowDays(value) {
  const days =
    typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return SDPD_WINDOW_DAY_OPTIONS.includes(days) ? days : SDPD_WINDOW_DAYS;
}
export const SDPD_PAGE_SIZE = 1000;
export const SDPD_MAX_ROWS = 2000;
export const SDPD_OUT_FIELDS = [
  'NIBRS_UNIQ',
  'CASE_NUMBER',
  'OCCURED_ON',
  'IBR_OFFENSE_DESCRIPTION',
  'PD_OFFENSE_CATEGORY',
  'CRIME_AGAINST',
  'VIOLENT_CRIME',
  'PROPERTY_CRIME',
  'NEIGHBORHOOD',
  'BLOCK_ADDR',
  'DIVISION',
  'GEOCODE_STATUS',
].join(',');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CRIME_AGAINST = new Set(['PE', 'PR', 'SO']);

/** Format a UTC instant as an America/Los_Angeles calendar date. */
export function formatSdpdQueryDate(ms = Date.now()) {
  const instant = Number(ms);
  if (!Number.isFinite(instant)) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** Build the registered FeatureServer query. Dates and paging are allowlisted. */
export function buildSdpdQueryUrl({
  sinceDate,
  offset = 0,
  recordCount = SDPD_PAGE_SIZE,
} = {}) {
  if (!ISO_DATE.test(String(sinceDate || ''))) return null;
  const resultOffset = Number(offset);
  const resultRecordCount = Number(recordCount);
  if (
    !Number.isInteger(resultOffset) ||
    resultOffset < 0 ||
    resultOffset > SDPD_MAX_ROWS
  )
    return null;
  if (
    !Number.isInteger(resultRecordCount) ||
    resultRecordCount < 1 ||
    resultRecordCount > SDPD_PAGE_SIZE
  )
    return null;
  const params = new URLSearchParams({
    where: `OCCURED_ON >= DATE '${sinceDate}'`,
    outFields: SDPD_OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    orderByFields: 'OCCURED_ON DESC',
    resultOffset: String(resultOffset),
    resultRecordCount: String(resultRecordCount),
    f: 'json',
  });
  return `${SDPD_FEATURE_LAYER_URL}/query?${params}`;
}

function text(value, max = 200) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function flag(value) {
  return value === 1 || value === true;
}

function crimeAgainst(value) {
  const code = text(value, 2);
  return code && CRIME_AGAINST.has(code) ? code : null;
}

function geometryLonLat(feature) {
  const geometry = feature?.geometry;
  if (geometry && Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) {
    return { lon: geometry.x, lat: geometry.y };
  }
  const coordinates = geometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return { lon: coordinates[0], lat: coordinates[1] };
  }
  return { lon: NaN, lat: NaN };
}

/** Validate one already-normalized report before it can replace displayed rows. */
export function normalizeSdpdRecord(row, index = 0) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const lon = Number(row.lon);
  const lat = Number(row.lat);
  if (!Number.isFinite(lon) || Math.abs(lon) > 180) return null;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  const occurredOnMs = Number(row.occurredOnMs);
  const stableId = text(row.stableId, 40) || `sdpd-${index + 1}`;
  return {
    stableId,
    caseNumber: text(row.caseNumber, 55),
    occurredOnMs: Number.isFinite(occurredOnMs) ? occurredOnMs : null,
    offense: text(row.offense, 80),
    category: text(row.category, 80),
    crimeAgainst: crimeAgainst(row.crimeAgainst),
    violent: flag(row.violent),
    property: flag(row.property),
    neighborhood: text(row.neighborhood, 200),
    blockAddress: text(row.blockAddress, 254),
    division: text(row.division, 200),
    lon,
    lat,
  };
}

/** Validate a complete proxy payload before it can replace displayed reports. */
export function normalizeSdpdRecords(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.reports)
      ? payload.reports
      : null;
  if (!rows) return null;
  const normalized = [];
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const record = normalizeSdpdRecord(row, index);
    if (!record) return null;
    if (ids.has(record.stableId)) return null;
    ids.add(record.stableId);
    normalized.push(record);
    if (normalized.length >= SDPD_MAX_ROWS) break;
  }
  return normalized;
}

/** Validate a FeatureServer page before merging it into the snapshot. */
export function normalizeSdpdFeaturePage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null;
  if (payload.error) return null;
  if (!Array.isArray(payload.features)) return null;
  const rows = [];
  const ids = new Set();
  for (const [index, feature] of payload.features.entries()) {
    const attributes = feature?.attributes;
    if (
      !attributes ||
      typeof attributes !== 'object' ||
      Array.isArray(attributes)
    )
      return null;
    if (text(attributes.GEOCODE_STATUS, 1) === 'U') continue;
    const { lon, lat } = geometryLonLat(feature);
    const record = normalizeSdpdRecord(
      {
        stableId: attributes.NIBRS_UNIQ,
        caseNumber: attributes.CASE_NUMBER,
        occurredOnMs: attributes.OCCURED_ON,
        offense: attributes.IBR_OFFENSE_DESCRIPTION,
        category: attributes.PD_OFFENSE_CATEGORY,
        crimeAgainst: attributes.CRIME_AGAINST,
        violent: attributes.VIOLENT_CRIME,
        property: attributes.PROPERTY_CRIME,
        neighborhood: attributes.NEIGHBORHOOD,
        blockAddress: attributes.BLOCK_ADDR,
        division: attributes.DIVISION,
        lon,
        lat,
      },
      index,
    );
    if (!record) return null;
    if (ids.has(record.stableId)) return null;
    ids.add(record.stableId);
    rows.push(record);
  }
  return rows;
}
