import { getPlanetaryAsset, assetStatus } from '../data/planetaryAssets.js';
import { getSolarBody } from './bodies.js';
import { liveHeliocentricAu } from './ephemeris.js';

function formatAu(au, digits = 2) {
  if (!Number.isFinite(au)) return null;
  return `${au.toFixed(digits)} AU`;
}

/**
 * Compact Solar System HUD copy: focused world, live AU, selected craft.
 * @param {{focusedBodyId?: string|null, selectedAssetId?: string|null, epochMs?: number}} [options]
 */
export function formatSolarSystemHud({
  focusedBodyId = null,
  selectedAssetId = null,
  epochMs = Date.now(),
} = {}) {
  const body = focusedBodyId ? getSolarBody(focusedBodyId) : null;
  const asset = selectedAssetId ? getPlanetaryAsset(selectedAssetId) : null;
  const au = body ? liveHeliocentricAu(body.id, epochMs) : null;
  const auLabel = formatAu(au, 2);
  const title = body
    ? `SOLAR SYSTEM / ${body.name.toUpperCase()}`
    : 'SOLAR SYSTEM';
  const label = asset
    ? `${title} / ${asset.name.toUpperCase()}`
    : auLabel && body
      ? `${title} · ${auLabel}`
      : title;
  return {
    label,
    alt: auLabel ? `AU: ${au.toFixed(2)}` : 'AU: ---',
    bodyId: body?.id || null,
    assetId: asset?.id || null,
    assetStatus: asset ? assetStatus(asset) : null,
    au,
  };
}
