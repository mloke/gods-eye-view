import * as Cesium from 'cesium';
import {
  SOLAR_BODIES,
  getSolarBody,
  listMoonsOf,
} from '../../solarSystem/bodies.js';
import {
  bodyWorldPosition,
  moonOffset,
  sampleHeliocentricOrbit,
} from '../../solarSystem/ephemeris.js';
import {
  SYSTEM_OVERVIEW_HEADING,
  SYSTEM_OVERVIEW_PITCH,
  SYSTEM_OVERVIEW_RANGE_M,
  enteredBodyRangeM,
  visualMoonOrbitMeters,
} from '../../solarSystem/scale.js';
import { lookAtSolarTarget } from '../../solarSystem/camera.js';
import { MOON_ELEMENTS } from '../../solarSystem/elements.js';
import {
  assetsForBody,
  heliocentricProbePosition,
  isSurfaceAsset,
  orbiterLocalPosition,
  roverLocalPosition,
} from '../../data/planetaryAssets.js';
import {
  ASSET_ENTITY_PREFIX,
  BODY_ENTITY_PREFIX,
  ORBIT_ENTITY_PREFIX,
  TEXTURE_URL,
} from './policy.js';

const MATERIAL_CACHE = new Map();
const ORBIT_REFRESH_MS = 60_000;

function cartesian(pos) {
  return new Cesium.Cartesian3(pos.x, pos.y, pos.z);
}

function addCartesian(origin, offset) {
  return new Cesium.Cartesian3(
    origin.x + offset.x,
    origin.y + offset.y,
    origin.z + offset.z,
  );
}

function bodyColor(body, alpha = 1) {
  const color = Cesium.Color.fromCssColorString(body.color || '#cccccc');
  return alpha === 1 ? color : color.withAlpha(alpha);
}

function materialFor(body, dimmed) {
  if (dimmed) return bodyColor(body, 0.28);
  if (!body.textureId) return bodyColor(body);
  let material = MATERIAL_CACHE.get(body.textureId);
  if (!material) {
    material = new Cesium.ImageMaterialProperty({
      image: TEXTURE_URL(body.textureId),
      color: Cesium.Color.WHITE,
      transparent: false,
    });
    MATERIAL_CACHE.set(body.textureId, material);
  }
  return material;
}

function setPosition(entity, pos) {
  const next = cartesian(pos);
  if (typeof entity.position?.getValue === 'function') {
    const current = entity.position.getValue();
    if (current && Cesium.Cartesian3.equals(current, next)) return;
  }
  if (typeof entity.position?.setValue === 'function') {
    entity.position.setValue(next);
    return;
  }
  entity.position = next;
}

function setShow(graphic, show) {
  if (!graphic) return;
  if (typeof graphic.show?.getValue === 'function') {
    if (Boolean(graphic.show.getValue()) === Boolean(show)) return;
    graphic.show.setValue(show);
    return;
  }
  if (graphic.show === show) return;
  graphic.show = show;
}

function setRadii(ellipsoid, radius) {
  const next = new Cesium.Cartesian3(radius, radius, radius);
  if (typeof ellipsoid.radii?.setValue === 'function') {
    const current = ellipsoid.radii.getValue?.();
    if (current?.x === radius) return;
    ellipsoid.radii.setValue(next);
    return;
  }
  ellipsoid.radii = next;
}

function setLabelStyle(label, { font, offsetY }) {
  if (!label) return;
  if (typeof label.font?.getValue === 'function') {
    if (label.font.getValue() !== font) label.font.setValue(font);
  } else if (label.font !== font) {
    label.font = font;
  }
  const offset = new Cesium.Cartesian2(0, offsetY);
  if (typeof label.pixelOffset?.getValue === 'function') {
    const current = label.pixelOffset.getValue();
    if (current?.y === offsetY) return;
    label.pixelOffset.setValue(offset);
    return;
  }
  label.pixelOffset = offset;
}

function applyBodyVisual(entity, body, visual) {
  const prev = entity.gevVisual || {};
  if (prev.showPoint !== visual.showPoint) setShow(entity.point, visual.showPoint);
  if (visual.showEllipsoid) {
    if (!entity.gevHasEllipsoid) {
      entity.ellipsoid = new Cesium.EllipsoidGraphics({
        radii: new Cesium.Cartesian3(visual.radius, visual.radius, visual.radius),
        material: materialFor(body, visual.dimmed),
        outline: body.kind === 'star',
        outlineColor: Cesium.Color.fromCssColorString('#ffdd88'),
        show: true,
      });
      entity.gevHasEllipsoid = true;
    } else if (!prev.showEllipsoid) {
      setShow(entity.ellipsoid, true);
      setRadii(entity.ellipsoid, visual.radius);
      entity.ellipsoid.material = materialFor(body, visual.dimmed);
    } else {
      if (prev.radius !== visual.radius) setRadii(entity.ellipsoid, visual.radius);
      if (prev.dimmed !== visual.dimmed)
        entity.ellipsoid.material = materialFor(body, visual.dimmed);
    }
  } else if (prev.showEllipsoid && entity.ellipsoid) {
    setShow(entity.ellipsoid, false);
  }
  if (entity.label) {
    if (prev.labelShow !== visual.labelShow) setShow(entity.label, visual.labelShow);
    if (prev.font !== visual.font || prev.offsetY !== visual.offsetY) {
      setLabelStyle(entity.label, visual);
    }
  }
  if (prev.entityShow !== visual.entityShow) entity.show = visual.entityShow;
  entity.gevVisual = visual;
}

function overviewPixelSize(body) {
  if (body.kind === 'star') return 28;
  if (body.kind === 'dwarf') return 14;
  return 18;
}

function labelFor(body, focused, overview) {
  return {
    text: body.name.toUpperCase(),
    font: focused ? '14px monospace' : '11px monospace',
    fillColor: Cesium.Color.WHITE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cesium.Cartesian2(0, overview ? -16 : -18),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    show: body.kind !== 'moon' || focused,
  };
}

/** Build or refresh the heliocentric entity graph. */
export function syncSolarEntities({
  dataSource,
  epochMs,
  focusedBodyId,
  showAssets,
}) {
  if (!dataSource) return 0;
  const focused = focusedBodyId ? getSolarBody(focusedBodyId) : null;
  const overview = !focused;
  const visibleMoonParent = focused
    ? focused.kind === 'moon'
      ? focused.parentId
      : focused.id
    : null;

  for (const body of SOLAR_BODIES) {
    const pos = bodyWorldPosition(body.id, epochMs);
    if (!pos) continue;
    const id = `${BODY_ENTITY_PREFIX}${body.id}`;
    let entity = dataSource.entities.getById(id);
    const localWorld =
      Boolean(focused) &&
      (body.id === focused.id ||
        body.id === visibleMoonParent ||
        body.parentId === visibleMoonParent);
    const showEllipsoid = Boolean(focused) && localWorld;
    const showPoint = overview
      ? body.kind !== 'moon'
      : !showEllipsoid && body.kind !== 'moon';
    const dimmed = Boolean(focused && body.id !== focused.id && body.kind !== 'moon');
    const radius =
      focused && body.id === focused.id
        ? body.visualRadiusM * 1.35
        : body.visualRadiusM;
    if (!entity) {
      entity = dataSource.entities.add({
        id,
        name: body.name,
        position: cartesian(pos),
        point: {
          pixelSize: overviewPixelSize(body),
          color: bodyColor(body),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: showPoint,
        },
        label: labelFor(body, body.id === focusedBodyId, overview),
        properties: { bodyId: body.id, kind: body.kind },
      });
    } else if (!showEllipsoid || !entity.gevVisual?.showEllipsoid) {
      // Pin textured globes. setValue on position rebuilds ImageMaterial.
      setPosition(entity, pos);
    }
    applyBodyVisual(entity, body, {
      showPoint,
      showEllipsoid,
      dimmed,
      radius,
      labelShow: body.kind !== 'moon' || body.parentId === visibleMoonParent,
      font: body.id === focusedBodyId ? '14px monospace' : '11px monospace',
      offsetY: overview ? -16 : -18,
      entityShow:
        body.kind !== 'moon' ||
        !focused ||
        body.parentId === visibleMoonParent ||
        body.id === focused.id,
    });

    if (body.parentId === 'sun' && body.kind !== 'star') {
      syncOrbit(dataSource, body.id, epochMs, dimmed);
    }
  }

  if (focused) {
    for (const moon of listMoonsOf(focused.kind === 'moon' ? focused.parentId : focused.id)) {
      syncMoonOrbit(dataSource, moon, epochMs);
    }
  } else {
    removePrefixed(dataSource, `${ORBIT_ENTITY_PREFIX}moon-`);
  }

  syncAssets(dataSource, focused, epochMs, showAssets);
  return dataSource.entities.values.length;
}

function syncOrbit(dataSource, bodyId, epochMs, dimmed) {
  const id = `${ORBIT_ENTITY_PREFIX}${bodyId}`;
  let entity = dataSource.entities.getById(id);
  const stale =
    !entity ||
    !Number.isFinite(entity.gevOrbitEpoch) ||
    Math.abs(epochMs - entity.gevOrbitEpoch) >= ORBIT_REFRESH_MS;
  if (!stale && entity.gevDimmed === dimmed) return;
  const samples = sampleHeliocentricOrbit(bodyId, epochMs, 96);
  if (samples.length < 4) return;
  const positions = samples.map(cartesian);
  positions.push(positions[0]);
  const material = Cesium.Color.fromCssColorString('#6aa7d8').withAlpha(
    dimmed ? 0.15 : 0.45,
  );
  if (!entity) {
    entity = dataSource.entities.add({
      id,
      polyline: {
        positions,
        width: 1,
        material,
      },
    });
  } else {
    entity.polyline.positions = positions;
    if (entity.gevDimmed !== dimmed) entity.polyline.material = material;
  }
  entity.gevOrbitEpoch = epochMs;
  entity.gevDimmed = dimmed;
}

function syncMoonOrbit(dataSource, moon, epochMs) {
  const parent = getSolarBody(moon.parentId);
  const parentPos = bodyWorldPosition(moon.parentId, epochMs);
  const elements = MOON_ELEMENTS[moon.id];
  if (!parent || !parentPos || !elements) return;
  const id = `${ORBIT_ENTITY_PREFIX}moon-${moon.id}`;
  const existing = dataSource.entities.getById(id);
  if (
    existing &&
    Number.isFinite(existing.gevOrbitEpoch) &&
    Math.abs(epochMs - existing.gevOrbitEpoch) < ORBIT_REFRESH_MS
  )
    return;
  const points = [];
  for (let i = 0; i < 64; i++) {
    const t = epochMs + (i / 64) * Math.abs(elements.periodDays) * 86_400_000;
    const offset = moonOffset(moon.id, t, parent.visualRadiusM);
    if (offset) points.push(addCartesian(parentPos, offset));
  }
  if (points.length < 4) return;
  points.push(points[0]);
  if (existing) {
    existing.polyline.positions = points;
    existing.gevOrbitEpoch = epochMs;
    return;
  }
  const entity = dataSource.entities.add({
    id,
    polyline: {
      positions: points,
      width: 1,
      material: Cesium.Color.fromCssColorString('#9ad0ff').withAlpha(0.4),
    },
  });
  entity.gevOrbitEpoch = epochMs;
}

function assetColor(asset) {
  if (asset.kind === 'rover') return Cesium.Color.fromCssColorString('#ffcc66');
  if (asset.kind === 'lander') return Cesium.Color.fromCssColorString('#ff9966');
  if (asset.kind === 'probe') return Cesium.Color.fromCssColorString('#d4b3ff');
  return Cesium.Color.fromCssColorString('#7ad7ff');
}

function assetWorldPosition(asset, host, hostPos, epochMs) {
  if (asset.heliocentricAu) return heliocentricProbePosition(asset);
  if (!host || !hostPos) return null;
  const local = isSurfaceAsset(asset)
    ? roverLocalPosition(asset, host.visualRadiusM)
    : orbiterLocalPosition(asset, host.visualRadiusM, epochMs);
  return local ? addCartesian(hostPos, local) : null;
}

function syncAssets(dataSource, focused, epochMs, showAssets) {
  const keep = new Set();
  if (showAssets) {
    const host = focused || getSolarBody('sun');
    const hostPos = host ? bodyWorldPosition(host.id, epochMs) : null;
    if (host && (hostPos || host.id === 'sun')) {
      for (const asset of assetsForBody(host.id)) {
        const position = assetWorldPosition(asset, host, hostPos, epochMs);
        if (!position) continue;
        const id = `${ASSET_ENTITY_PREFIX}${asset.id}`;
        keep.add(id);
        let entity = dataSource.entities.getById(id);
        if (!entity) {
          dataSource.entities.add({
            id,
            name: asset.name,
            position,
            point: {
              pixelSize: isSurfaceAsset(asset) ? 10 : 8,
              color: assetColor(asset),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            label: {
              text: asset.name,
              font: '10px monospace',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            properties: {
              assetId: asset.id,
              kind: asset.kind,
              asOf: asset.asOf,
              note: asset.note,
            },
          });
        } else {
          setPosition(entity, position);
        }
      }
    }
  }
  const remove = [];
  for (const entity of dataSource.entities.values) {
    if (
      String(entity.id).startsWith(ASSET_ENTITY_PREFIX) &&
      !keep.has(entity.id)
    )
      remove.push(entity);
  }
  for (const entity of remove) dataSource.entities.remove(entity);
}

function removePrefixed(dataSource, prefix) {
  const remove = [];
  for (const entity of dataSource.entities.values) {
    if (String(entity.id).startsWith(prefix)) remove.push(entity);
  }
  for (const entity of remove) dataSource.entities.remove(entity);
}

export function pickSolarBodyId(picked) {
  const id = String(picked?.id?.id || picked?.id || '');
  if (id.startsWith(BODY_ENTITY_PREFIX))
    return id.slice(BODY_ENTITY_PREFIX.length);
  return null;
}

export function flyToSolarOverview(viewer) {
  return lookAtSolarTarget(
    viewer,
    Cesium.Cartesian3.ZERO,
    SYSTEM_OVERVIEW_RANGE_M,
    {
      heading: SYSTEM_OVERVIEW_HEADING,
      pitch: SYSTEM_OVERVIEW_PITCH,
    },
  );
}

export function flyToSolarBody(viewer, bodyId, epochMs) {
  const body = getSolarBody(bodyId);
  const pos = bodyWorldPosition(bodyId, epochMs);
  if (!viewer?.camera || !body || !pos) return false;
  return lookAtSolarTarget(
    viewer,
    cartesian(pos),
    enteredBodyRangeM(body.visualRadiusM),
    { heading: 0, pitch: -0.45 },
  );
}

export { visualMoonOrbitMeters };
