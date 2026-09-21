import * as Cesium from 'cesium';
import { formatWatchOccurredOn as formatOccurredOn } from './records.js';
export { formatWatchOccurredOn } from './records.js';

export const GEOFENCE_WATCH_OVERLAY_SOURCE_ID = 'geofence-watch';
export const GEOFENCE_WATCH_OVERLAY_COHORT_LIMIT = 64;
export const GEOFENCE_WATCH_OVERLAY_COLLISION_CAPACITY = 32;
export const GEOFENCE_WATCH_INTERVAL_MS = 15 * 60_000;

const FENCE_COLOR = Cesium.Color.fromCssColorString('#f0a63c');
const VIOLENT_COLOR = Cesium.Color.fromCssColorString('#ff4d4d');
const PROPERTY_COLOR = Cesium.Color.fromCssColorString('#f0a63c');
const OTHER_COLOR = Cesium.Color.fromCssColorString('#6ec8ff');

export function fenceColor(fence) {
  if (fence?.color) {
    try {
      return Cesium.Color.fromCssColorString(fence.color) || FENCE_COLOR;
    } catch {
      return FENCE_COLOR;
    }
  }
  return FENCE_COLOR;
}

export function eventColor(event) {
  if (event?.violent) return VIOLENT_COLOR;
  if (event?.property) return PROPERTY_COLOR;
  return OTHER_COLOR;
}

export function eventAccent(event) {
  return eventColor(event).toCssColorString();
}

function eventDetails(event) {
  const details = [];
  const occurred = formatOccurredOn(event?.occurredOnMs);
  if (occurred) details.push(occurred);
  if (event?.neighborhood) details.push(event.neighborhood);
  if (event?.blockAddress) details.push(event.blockAddress);
  if (event?.caseNumber) details.push(`Case ${event.caseNumber}`);
  if (event?.fenceName) details.push(event.fenceName);
  return details;
}

function eventPriority(event) {
  const recency = Number.isFinite(event?.occurredOnMs)
    ? Math.max(0, Math.floor(event.occurredOnMs / 1000))
    : 0;
  const weight = event?.violent
    ? 2_000_000_000
    : event?.property
      ? 1_000_000_000
      : 0;
  return weight + recency;
}

/** Ambient overlay label for one logged watch event. */
export function createGeofenceWatchOverlayEntry({ id, position, record }) {
  return {
    id: String(id),
    position,
    variant: 'label',
    title: record?.title || 'Watch event',
    accent: eventAccent(record),
    priority: eventPriority(record),
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

/** Selected overlay card for one logged watch event. */
export function createGeofenceWatchSelectedOverlayEntry({
  id,
  position,
  record,
}) {
  return {
    id: String(id),
    position,
    variant: 'card',
    cardStyle: 'tactical',
    title: record?.title || 'Watch event',
    details: eventDetails(record),
    accent: eventAccent(record),
    priority: eventPriority(record) + 3_000_000_000,
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

export function selectGeofenceWatchOverlayCohort(
  entries,
  limit = GEOFENCE_WATCH_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(
    0,
    Math.min(
      GEOFENCE_WATCH_OVERLAY_COHORT_LIMIT,
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
