import * as Cesium from 'cesium';
import { weatherCodeLabel } from '../../data/regionalModel.js';
import { WEATHER_LAYER_ID } from './records.js';

export const WEATHER_OVERLAY_SOURCE_ID = WEATHER_LAYER_ID;
export const WEATHER_OVERLAY_COHORT_LIMIT = 16;
export const WEATHER_OVERLAY_COLLISION_CAPACITY = 16;
export { WEATHER_LAYER_ID, weatherCodeLabel };

const COLD = Cesium.Color.fromCssColorString('#6ec8ff');
const COOL = Cesium.Color.fromCssColorString('#8fd4c8');
const MILD = Cesium.Color.fromCssColorString('#d4e07a');
const WARM = Cesium.Color.fromCssColorString('#f0b35a');
const HOT = Cesium.Color.fromCssColorString('#e07050');

/** Color a sample by observed temperature. */
export function weatherColor(record) {
  const temp = Number(record?.temperatureC);
  if (!(temp > -80)) return MILD;
  if (temp < 0) return COLD;
  if (temp < 10) return COOL;
  if (temp < 20) return MILD;
  if (temp < 28) return WARM;
  return HOT;
}

export function weatherAccent(record) {
  return weatherColor(record).toCssColorString();
}

export function weatherLabelTitle(record) {
  const temp = Number(record?.temperatureC);
  const condition = weatherCodeLabel(record?.weatherCode);
  const degrees = Number.isFinite(temp) ? `${Math.round(temp)}°C` : '—';
  return `${degrees} · ${condition}`;
}

function weatherDetails(record) {
  const details = [];
  if (Number.isFinite(record?.windKph)) {
    const dir = Number.isFinite(record.windDirectionDeg)
      ? ` ${Math.round(record.windDirectionDeg)}°`
      : '';
    details.push(`${Math.round(record.windKph)} km/h${dir}`);
  }
  if (Number.isFinite(record?.cloudCoverPct))
    details.push(`${Math.round(record.cloudCoverPct)}% cloud`);
  if (Number.isFinite(record?.precipitationMm) && record.precipitationMm > 0)
    details.push(`${record.precipitationMm.toFixed(1)} mm precip`);
  return details;
}

function weatherPriority(record) {
  const code = Number(record?.weatherCode);
  const storm = Number.isFinite(code) && code >= 80 ? 1_000 : 0;
  const precip = Math.max(0, Number(record?.precipitationMm) || 0) * 10;
  return storm + precip + Math.abs(Number(record?.temperatureC) || 0);
}

function overlayEntry({ id, position, record, selected }) {
  return {
    id: String(id),
    position,
    variant: 'label',
    title: weatherLabelTitle(record),
    details: weatherDetails(record),
    accent: weatherAccent(record),
    priority: weatherPriority(record) + (selected ? 10_000 : 0),
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

/** Ambient overlay label for one viewport sample. */
export function createWeatherOverlayEntry(input) {
  return overlayEntry({ ...input, selected: false });
}

/** Selected overlay label for one viewport sample. */
export function createWeatherSelectedOverlayEntry(input) {
  return overlayEntry({ ...input, selected: true });
}

/** Keep stormy / extreme samples when labels collide. */
export function selectWeatherOverlayCohort(
  entries,
  limit = WEATHER_OVERLAY_COHORT_LIMIT,
) {
  const cap = Math.max(
    0,
    Math.min(WEATHER_OVERLAY_COHORT_LIMIT, Math.floor(Number(limit) || 0)),
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

/** JSON-safe analyst record for one weather sample. */
export function mapAnalystRecord(raw, index = 0) {
  const num = (value) => (Number.isFinite(value) ? value : null);
  return {
    id: String(raw?.id || `WX-${String(index).padStart(4, '0')}`),
    temperatureC: num(raw?.temperatureC),
    windKph: num(raw?.windKph),
    weatherCode: num(raw?.weatherCode),
    condition: weatherCodeLabel(raw?.weatherCode),
    lat: num(raw?.lat),
    lon: num(raw?.lon),
    observedAt: typeof raw?.observedAt === 'string' ? raw.observedAt : null,
  };
}

export { normalizeWeatherSnapshot } from './records.js';
