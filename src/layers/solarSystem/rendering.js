import * as Cesium from 'cesium';
import {
  SOLAR_BODIES,
  focusedSystemParentId,
  getSolarBody,
  isInFocusedSystem,
  isLocalSystemBody,
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
  displayBodyRadiusM,
  enteredBodyRangeM,
  visualMetersFromAu,
  visualMoonOrbitMeters,
} from '../../solarSystem/scale.js';
import { lookAtSolarTarget } from '../../solarSystem/camera.js';
import { MOON_ELEMENTS } from '../../solarSystem/elements.js';
import {
  bodyAttitude,
  bodyOrientationComponents,
  equatorialRingOffset,
} from '../../solarSystem/orientation.js';
import {
  assetWorldPosition,
  assetsForBody,
  getPlanetaryAsset,
  isSurfaceAsset,
  orbiterOrbitLocalPositions,
} from '../../data/planetaryAssets.js';
import { createTacticalOrbitMaterialProperty } from '../../solarSystem/tacticalOrbitMaterial.js';
import {
  ASSET_ENTITY_PREFIX,
  BODY_ENTITY_PREFIX,
  GLOBE_ENTITY_SUFFIX,
  ORBIT_ENTITY_PREFIX,
  RING_ENTITY_PREFIX,
  SOLAR_SYSTEM_UPDATE_MS,
  TEXTURE_URL,
} from './policy.js';

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

function orientationFor(body, epochMs) {
  const q = bodyOrientationComponents(body.id, epochMs);
  return new Cesium.Quaternion(q.x, q.y, q.z, q.w);
}

function setOrientation(entity, orientation) {
  if (entity.gevOriented) return;
  entity.orientation = orientation;
  entity.gevOriented = true;
}

function readMovingPosition(entity, result) {
  const dest = result || new Cesium.Cartesian3();
  const to = entity.gevPosTo;
  if (!to) {
    const current = entity.position?.getValue?.();
    return current ? Cesium.Cartesian3.clone(current, dest) : dest;
  }
  const start = entity.gevPosStart;
  if (!start) return Cesium.Cartesian3.clone(to, dest);
  const t = Math.min(1, (performance.now() - start) / SOLAR_SYSTEM_UPDATE_MS);
  if (t >= 1) return Cesium.Cartesian3.clone(to, dest);
  return Cesium.Cartesian3.lerp(entity.gevPosFrom, to, t, dest);
}

/**
 * ImageMaterial ellipsoids flash when ConstantPositionProperty.setValue
 * rebuilds the primitive. A CallbackProperty only updates the model matrix.
 */
function ensureMovingPosition(entity, pos) {
  const next = cartesian(pos);
  if (!entity.gevPosTo) {
    entity.gevPosFrom = Cesium.Cartesian3.clone(next);
    entity.gevPosTo = next;
    entity.gevPosStart = 0;
    entity.gevPosScratch = new Cesium.Cartesian3();
    entity.position = new Cesium.CallbackProperty(
      (_time, result) => readMovingPosition(entity, result || entity.gevPosScratch),
      false,
    );
    return;
  }
  if (Cesium.Cartesian3.equalsEpsilon(entity.gevPosTo, next, 0, 1)) return;
  const now = performance.now();
  const t = entity.gevPosStart
    ? Math.min(1, (now - entity.gevPosStart) / SOLAR_SYSTEM_UPDATE_MS)
    : 1;
  if (t >= 1) Cesium.Cartesian3.clone(entity.gevPosTo, entity.gevPosFrom);
  else Cesium.Cartesian3.lerp(entity.gevPosFrom, entity.gevPosTo, t, entity.gevPosFrom);
  entity.gevPosTo = next;
  entity.gevPosStart = now;
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

const globePrimitives = new Map();
const satelliteOrbitCollections = new Map();
const globePosScratch = new Cesium.Cartesian3();
const globeRotScratch = new Cesium.Matrix3();
const globeQuatScratch = new Cesium.Quaternion();
let globePreRenderRemove = null;

function globeEntityId(bodyId) {
  return `${BODY_ENTITY_PREFIX}${bodyId}${GLOBE_ENTITY_SUFFIX}`;
}

const globeImages = new Map();

function globeImage(textureId) {
  let image = globeImages.get(textureId);
  if (image) return image;
  image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = TEXTURE_URL(textureId);
  globeImages.set(textureId, image);
  return image;
}

function globeAppearance(body, dimmed) {
  if (dimmed || !body.textureId) {
    return new Cesium.MaterialAppearance({
      material: Cesium.Material.fromType('Color', {
        color: bodyColor(body, dimmed ? 0.28 : 1),
      }),
      closed: true,
      translucent: Boolean(dimmed),
    });
  }
  return new Cesium.MaterialAppearance({
    material: Cesium.Material.fromType('DiffuseMap', {
      image: globeImage(body.textureId),
    }),
    materialSupport: Cesium.MaterialAppearance.MaterialSupport.TEXTURED,
    closed: true,
    translucent: false,
    flat: true,
  });
}

function writeGlobeMatrix(primitive, entity) {
  const pos = readMovingPosition(entity, globePosScratch);
  let quat = globeQuatScratch;
  if (typeof entity.orientation?.getValue === 'function') {
    const value = entity.orientation.getValue();
    if (value) quat = value;
    else Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, quat);
  } else if (entity.orientation) {
    quat = entity.orientation;
  } else {
    Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, quat);
  }
  Cesium.Matrix3.fromQuaternion(quat, globeRotScratch);
  Cesium.Matrix4.fromRotationTranslation(
    globeRotScratch,
    pos,
    primitive.modelMatrix,
  );
}

function satelliteOrbitHostBodies(focused) {
  if (!focused) return [];
  const parent = getSolarBody(focusedSystemParentId(focused));
  return [parent, ...listMoonsOf(parent?.id)].filter(Boolean);
}

function satelliteOrbitEntityId(assetId) {
  return `${ORBIT_ENTITY_PREFIX}sat-${assetId}`;
}

function satelliteOrbitPositions(hostEntity, locals) {
  const host = readMovingPosition(hostEntity);
  return locals.map(
    (point) =>
      new Cesium.Cartesian3(host.x + point.x, host.y + point.y, host.z + point.z),
  );
}

function syncSatelliteOrbits(scene, dataSource, focused, selectedAssetId) {
  const keep = new Set();
  for (const body of satelliteOrbitHostBodies(focused)) {
    const hostEntity = dataSource.entities.getById(`${BODY_ENTITY_PREFIX}${body.id}`);
    if (!hostEntity) continue;
    for (const asset of assetsForBody(body.id)) {
      if (asset.kind !== 'orbiter') continue;
      const locals = orbiterOrbitLocalPositions(asset, body.radiusM);
      if (locals.length < 4) continue;
      const id = satelliteOrbitEntityId(asset.id);
      keep.add(id);
      const selected = selectedAssetId === asset.id;
      const width = selected ? 5 : 3;
      const material = createTacticalOrbitMaterialProperty(
        selected ? '#7ff6f6' : '#22e6e6',
        selected ? 1 : 0.95,
      );
      let entity = dataSource.entities.getById(id);
      if (!entity) {
        entity = dataSource.entities.add({
          id,
          polyline: {
            positions: new Cesium.CallbackProperty(
              () => satelliteOrbitPositions(hostEntity, locals),
              false,
            ),
            width,
            material,
            depthFailMaterial: material,
            arcType: Cesium.ArcType.NONE,
          },
        });
        entity.gevSelected = selected;
      } else if (entity.gevSelected !== selected) {
        entity.polyline.width = width;
        entity.polyline.material = material;
        entity.polyline.depthFailMaterial = material;
        entity.gevSelected = selected;
      }
    }
  }
  const remove = [];
  for (const entity of dataSource.entities.values) {
    if (
      String(entity.id).startsWith(`${ORBIT_ENTITY_PREFIX}sat-`) &&
      !keep.has(entity.id)
    )
      remove.push(entity);
  }
  for (const entity of remove) dataSource.entities.remove(entity);
  if (!scene?.primitives) return;
  for (const [bodyId, collection] of [...satelliteOrbitCollections]) {
    scene.primitives.remove(collection);
    satelliteOrbitCollections.delete(bodyId);
  }
}

/**
 * Textured globes cannot live on a CallbackProperty entity — Cesium's
 * dynamic ellipsoid path keeps the white tint and drops the image.
 * A scene Primitive updates only its model matrix, so maps stay put.
 */
function syncBodyGlobePrimitive(scene, collection, entity, body, visual) {
  if (entity.ellipsoid) setShow(entity.ellipsoid, false);
  const leftover = collection?.getById(globeEntityId(body.id));
  if (leftover) collection.remove(leftover);
  if (!scene?.primitives) return;
  removeOrphanGlobePrimitives(scene);
  let primitive = globePrimitives.get(body.id);
  if (!visual.showEllipsoid) {
    if (primitive) primitive.show = false;
    return;
  }
  if (
    !primitive ||
    primitive.gevRadius !== visual.radius ||
    primitive.gevDimmed !== visual.dimmed
  ) {
    if (primitive) scene.primitives.remove(primitive);
    const appearance = globeAppearance(body, visual.dimmed);
    primitive = scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: new Cesium.EllipsoidGeometry({
            radii: new Cesium.Cartesian3(
              visual.radius,
              visual.radius,
              visual.radius,
            ),
            vertexFormat: appearance.vertexFormat,
          }),
          id: `${BODY_ENTITY_PREFIX}${body.id}`,
        }),
        appearance,
        asynchronous: false,
        compressVertices: false,
      }),
    );
    primitive.gevRadius = visual.radius;
    primitive.gevDimmed = visual.dimmed;
    globePrimitives.set(body.id, primitive);
  }
  primitive.gevEntity = entity;
  primitive.show = true;
  writeGlobeMatrix(primitive, entity);
}

function removeOrphanGlobePrimitives(scene) {
  if (!scene?.primitives) return;
  const keep = new Set(globePrimitives.values());
  for (let i = scene.primitives.length - 1; i >= 0; i -= 1) {
    const primitive = scene.primitives.get(i);
    if (primitive?.gevRadius && !keep.has(primitive))
      scene.primitives.remove(primitive);
  }
}

export function bindSolarGlobeRender(scene) {
  if (!scene) return;
  if (globePreRenderRemove) return;
  removeOrphanGlobePrimitives(scene);
  globePreRenderRemove = scene.preRender.addEventListener(() => {
    for (const primitive of globePrimitives.values()) {
      if (!primitive.show || !primitive.gevEntity) continue;
      writeGlobeMatrix(primitive, primitive.gevEntity);
    }
  });
}

export function destroySolarGlobes(scene) {
  globePreRenderRemove?.();
  globePreRenderRemove = null;
  for (const primitive of globePrimitives.values()) {
    scene?.primitives?.remove(primitive);
  }
  globePrimitives.clear();
  for (const collection of satelliteOrbitCollections.values()) {
    scene?.primitives?.remove(collection);
  }
  satelliteOrbitCollections.clear();
}

function applyBodyVisual(entity, body, visual, scene, collection) {
  const prev = entity.gevVisual || {};
  if (prev.showPoint !== visual.showPoint) setShow(entity.point, visual.showPoint);
  syncBodyGlobePrimitive(scene, collection, entity, body, visual);
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
  scene,
  epochMs,
  focusedBodyId,
  selectedAssetId,
  showAssets,
}) {
  if (!dataSource) return 0;
  const focused = focusedBodyId ? getSolarBody(focusedBodyId) : null;
  const overview = !focused;
  const visibleMoonParent = focusedSystemParentId(focused);

  for (const body of SOLAR_BODIES) {
    const pos = bodyWorldPosition(body.id, epochMs);
    if (!pos) continue;
    const id = `${BODY_ENTITY_PREFIX}${body.id}`;
    let entity = dataSource.entities.getById(id);
    const inSystem = isInFocusedSystem(body, focused);
    const localWorld = isLocalSystemBody(body, focused);
    const showEllipsoid = Boolean(focused) && localWorld;
    const showPoint = inSystem && !showEllipsoid;
    const dimmed = Boolean(focused && inSystem && !localWorld);
    const radius = displayBodyRadiusM(body);
    if (!entity) {
      entity = dataSource.entities.add({
        id,
        name: body.name,
        position: cartesian(pos),
        orientation: orientationFor(body, epochMs),
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
      entity.gevOriented = true;
    }
    ensureMovingPosition(entity, pos);
    if (showEllipsoid) setOrientation(entity, orientationFor(body, epochMs));
    applyBodyVisual(
      entity,
      body,
      {
        showPoint,
        showEllipsoid,
        dimmed,
        radius,
        labelShow: inSystem,
        font: body.id === focusedBodyId ? '14px monospace' : '11px monospace',
        offsetY: overview ? -16 : -18,
        entityShow: inSystem,
      },
      scene,
      dataSource.entities,
    );

    if (
      (overview || focused?.kind !== 'moon') &&
      body.parentId === 'sun' &&
      body.kind !== 'star'
    ) {
      syncOrbit(dataSource, body.id, epochMs, dimmed);
    }
  }

  if (focused?.kind === 'moon') {
    removeHeliocentricOrbits(dataSource);
  }
  if (focused) {
    for (const moon of listMoonsOf(visibleMoonParent)) {
      syncMoonOrbit(dataSource, moon, epochMs);
    }
  } else {
    removePrefixed(dataSource, `${ORBIT_ENTITY_PREFIX}moon-`);
  }

  syncSaturnRings(dataSource, focused, epochMs);
  syncAssets(dataSource, focused, epochMs, showAssets, selectedAssetId);
  syncSatelliteOrbits(scene, dataSource, focused, selectedAssetId);
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
        arcType: Cesium.ArcType.NONE,
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
  const parentEntity = dataSource.entities.getById(
    `${BODY_ENTITY_PREFIX}${moon.parentId}`,
  );
  const pinned = parentEntity
    ? readMovingPosition(parentEntity)
    : parentEntity?.position?.getValue?.();
  const parentPos =
    pinned && Number.isFinite(pinned.x)
      ? { x: pinned.x, y: pinned.y, z: pinned.z }
      : bodyWorldPosition(moon.parentId, epochMs);
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
    const offset = moonOffset(moon.id, t, parent.radiusM);
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
      arcType: Cesium.ArcType.NONE,
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

const SATURN_RING_SCALES = [1.22, 1.55, 1.95, 2.35];
const SATURN_RING_SAMPLES = 96;

function saturnRingHost(focused) {
  if (!focused) return null;
  if (focused.id === 'saturn') return focused;
  if (focused.parentId === 'saturn') return getSolarBody('saturn');
  return null;
}

function ringPositions(center, radiusM, tiltRad) {
  const points = [];
  for (let i = 0; i <= SATURN_RING_SAMPLES; i += 1) {
    const t = (i / SATURN_RING_SAMPLES) * Math.PI * 2;
    const offset = equatorialRingOffset(radiusM, t, tiltRad);
    points.push(
      new Cesium.Cartesian3(
        center.x + offset.x,
        center.y + offset.y,
        center.z + offset.z,
      ),
    );
  }
  return points;
}

function syncSaturnRings(dataSource, focused, epochMs) {
  const saturn = saturnRingHost(focused);
  if (!saturn) {
    removePrefixed(dataSource, RING_ENTITY_PREFIX);
    return;
  }
  const pos = bodyWorldPosition('saturn', epochMs);
  if (!pos) return;
  SATURN_RING_SCALES.forEach((scale, index) => {
    const id = `${RING_ENTITY_PREFIX}${index}`;
    if (dataSource.entities.getById(id)) return;
    dataSource.entities.add({
      id,
      polyline: {
        positions: ringPositions(
          pos,
          saturn.radiusM * scale,
          bodyAttitude('saturn', epochMs).tiltRad,
        ),
        width: index === 1 || index === 2 ? 4 : 2.5,
        material: Cesium.Color.fromCssColorString('#d8c49a').withAlpha(
          index % 2 === 0 ? 0.55 : 0.78,
        ),
        arcType: Cesium.ArcType.NONE,
      },
    });
  });
}

function syncAssets(dataSource, focused, epochMs, showAssets, selectedAssetId) {
  const keep = new Set();
  if (showAssets) {
    const hosts = focused
      ? satelliteOrbitHostBodies(focused)
      : [getSolarBody('sun')].filter(Boolean);
    for (const host of hosts) {
      for (const asset of assetsForBody(host.id)) {
        const hostEntity = dataSource.entities.getById(
          `${BODY_ENTITY_PREFIX}${asset.bodyId}`,
        );
        const pinnedHost = hostEntity ? readMovingPosition(hostEntity) : null;
        const position = assetWorldPosition(
          asset,
          epochMs,
          pinnedHost && Number.isFinite(pinnedHost.x)
            ? { x: pinnedHost.x, y: pinnedHost.y, z: pinnedHost.z }
            : null,
        );
        if (!position) continue;
        const id = `${ASSET_ENTITY_PREFIX}${asset.id}`;
        keep.add(id);
        const selected = selectedAssetId === asset.id;
        const surface = isSurfaceAsset(asset);
        const pixelSize = selected ? (surface ? 16 : 14) : surface ? 10 : 8;
        const depthDisable = surface ? Number.POSITIVE_INFINITY : 0;
        let entity = dataSource.entities.getById(id);
        if (!entity) {
          entity = dataSource.entities.add({
            id,
            name: asset.name,
            position,
            point: {
              pixelSize,
              color: assetColor(asset),
              outlineColor: selected
                ? Cesium.Color.fromCssColorString('#ffe08a')
                : Cesium.Color.BLACK,
              outlineWidth: selected ? 2 : 1,
              disableDepthTestDistance: depthDisable,
            },
            label: {
              text: asset.name,
              font: selected ? '12px monospace' : '10px monospace',
              fillColor: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              disableDepthTestDistance: depthDisable,
            },
            properties: {
              assetId: asset.id,
              kind: asset.kind,
              asOf: asset.asOf,
              note: asset.note,
            },
          });
          entity.gevSelected = selected;
          ensureMovingPosition(entity, position);
        } else {
          ensureMovingPosition(entity, position);
          if (entity.point.disableDepthTestDistance !== depthDisable) {
            entity.point.disableDepthTestDistance = depthDisable;
            entity.label.disableDepthTestDistance = depthDisable;
          }
          if (entity.gevSelected !== selected) {
            entity.point.pixelSize = pixelSize;
            entity.point.outlineColor = selected
              ? Cesium.Color.fromCssColorString('#ffe08a')
              : Cesium.Color.BLACK;
            entity.point.outlineWidth = selected ? 2 : 1;
            entity.label.font = selected ? '12px monospace' : '10px monospace';
            entity.gevSelected = selected;
          }
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

function removeHeliocentricOrbits(dataSource) {
  const moonPrefix = `${ORBIT_ENTITY_PREFIX}moon-`;
  const remove = [];
  for (const entity of dataSource.entities.values) {
    const id = String(entity.id);
    if (id.startsWith(ORBIT_ENTITY_PREFIX) && !id.startsWith(moonPrefix)) {
      remove.push(entity);
    }
  }
  for (const entity of remove) dataSource.entities.remove(entity);
}

export function pickSolarBodyId(picked) {
  const id = String(picked?.id?.id || picked?.id || '');
  if (!id.startsWith(BODY_ENTITY_PREFIX)) return null;
  let rest = id.slice(BODY_ENTITY_PREFIX.length);
  if (rest.endsWith(GLOBE_ENTITY_SUFFIX))
    rest = rest.slice(0, -GLOBE_ENTITY_SUFFIX.length);
  return rest || null;
}

export function pickSolarAssetId(picked) {
  const id = String(picked?.id?.id || picked?.id || '');
  if (id.startsWith(ASSET_ENTITY_PREFIX))
    return id.slice(ASSET_ENTITY_PREFIX.length);
  return null;
}

export function flyToSolarAsset(viewer, assetId, epochMs) {
  const asset = getPlanetaryAsset(assetId);
  const pos = assetWorldPosition(asset, epochMs);
  if (!viewer?.camera || !asset || !pos) return false;
  const host = getSolarBody(asset.bodyId);
  if (isSurfaceAsset(asset) && host) {
    return flyToSolarBody(viewer, host.id, epochMs);
  }
  const hostRadius = host?.radiusM || visualMetersFromAu(0.02);
  const altitudeM = Math.max(0, Number(asset.altitudeKm) || 0) * 1000;
  const range = Math.max(hostRadius * 3.2, altitudeM * 0.7, 16_000);
  return lookAtSolarTarget(viewer, cartesian(pos), range, {
    heading: 0.35,
    pitch: -0.55,
  });
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
    enteredBodyRangeM(body),
    { heading: 0, pitch: -0.45 },
  );
}

export { visualMoonOrbitMeters };
