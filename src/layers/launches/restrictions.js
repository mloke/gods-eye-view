import * as Cesium from 'cesium';
import { restrictionMatchesLaunch } from '../../data/spaceOperationRestrictions.js';

const RESTRICTION_PREFIX = 'rocket-restriction:';

/** Draw active space-operation closures on the Earth globe. */
export function createRestrictions({ state: layerState }) {
  function noticesForLaunch(launch) {
    return (layerState._spaceRestrictions || []).filter((notice) =>
      restrictionMatchesLaunch(notice, launch),
    );
  }

  function clearRestrictionEntities() {
    if (!layerState._dataSource) return;
    const stale = [];
    for (const entity of layerState._dataSource.entities.values) {
      if (String(entity.id).startsWith(RESTRICTION_PREFIX)) stale.push(entity);
    }
    stale.forEach((entity) => layerState._dataSource.entities.remove(entity));
  }

  function sync(selectedLaunchId = layerState._selectedLaunchId) {
    if (!layerState._dataSource) return;
    clearRestrictionEntities();
    const launch = layerState._launches.find((item) => item.id === selectedLaunchId);
    for (const notice of layerState._spaceRestrictions || []) {
      const matched = Boolean(launch && restrictionMatchesLaunch(notice, launch));
      notice.areas.forEach((area, index) => {
        const positions = areaPositions(area);
        if (positions.length < 3) return;
        const outline =
          notice.kind === 'ship'
            ? Cesium.Color.fromCssColorString('#3ec6ff')
            : Cesium.Color.fromCssColorString('#ffb020');
        layerState._dataSource.entities.add({
          id: `${RESTRICTION_PREFIX}${notice.id}:${index}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: outline.withAlpha(matched ? 0.34 : 0.2),
            classificationType: Cesium.ClassificationType.BOTH,
            arcType: Cesium.ArcType.GEODESIC,
          },
          polyline: {
            positions: [...positions, positions[0]],
            width: matched ? 3 : 2,
            material: outline,
            arcType: Cesium.ArcType.GEODESIC,
            clampToGround: true,
          },
        });
      });
    }
  }

  return { sync, noticesForLaunch, clearRestrictionEntities };
}

function areaPositions(area) {
  if (area?.type === 'circle') return circlePositions(area.lat, area.lon, area.radiusM);
  if (area?.type !== 'polygon' || !Array.isArray(area.positions)) return [];
  return area.positions
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
    .map((point) => Cesium.Cartesian3.fromDegrees(point.lon, point.lat));
}

function circlePositions(lat, lon, radiusM) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(radiusM > 0)) return [];
  const earthRadius = 6_378_137;
  const steps = 72;
  const positions = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const north = Math.cos(angle) * radiusM;
    const east = Math.sin(angle) * radiusM;
    const latOffset = (north / earthRadius) * (180 / Math.PI);
    const lonOffset =
      (east / (earthRadius * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
    positions.push(Cesium.Cartesian3.fromDegrees(lon + lonOffset, lat + latOffset));
  }
  return positions;
}
