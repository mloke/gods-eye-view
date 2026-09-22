import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  SYSTEM_OVERVIEW_HEADING,
  SYSTEM_OVERVIEW_PITCH,
  SYSTEM_OVERVIEW_RANGE_M,
} from '../../solarSystem/scale.js';
import {
  ASSET_ENTITY_PREFIX,
  BODY_ENTITY_PREFIX,
  GLOBE_ENTITY_SUFFIX,
  ORBIT_ENTITY_PREFIX,
  RING_ENTITY_PREFIX,
} from './policy.js';
import {
  flyToSolarAsset,
  flyToSolarOverview,
  pickSolarAssetId,
  pickSolarBodyId,
  syncSolarEntities,
} from './rendering.js';

function shown(graphic) {
  if (!graphic) return false;
  if (typeof graphic.show?.getValue === 'function') return Boolean(graphic.show.getValue());
  return Boolean(graphic.show);
}

test('solar overview looks straight down from +Z onto the ecliptic', () => {
  const lookAtCalls = [];
  const viewer = {
    scene: { requestRender() {} },
    camera: {
      lookAtTransform(transform, hpr) {
        lookAtCalls.push({
          translation: Cesium.Matrix4.getTranslation(
            transform,
            new Cesium.Cartesian3(),
          ),
          heading: hpr.heading,
          pitch: hpr.pitch,
          range: hpr.range,
        });
      },
    },
  };
  assert.equal(flyToSolarOverview(viewer), true);
  assert.equal(lookAtCalls.length, 1);
  assert.equal(lookAtCalls[0].translation.x, 0);
  assert.equal(lookAtCalls[0].translation.y, 0);
  assert.equal(lookAtCalls[0].translation.z, 0);
  assert.equal(lookAtCalls[0].heading, SYSTEM_OVERVIEW_HEADING);
  assert.equal(lookAtCalls[0].pitch, SYSTEM_OVERVIEW_PITCH);
  assert.equal(lookAtCalls[0].range, SYSTEM_OVERVIEW_RANGE_M);
  assert.equal(SYSTEM_OVERVIEW_HEADING, 0);
  assert.equal(SYSTEM_OVERVIEW_PITCH, -Math.PI / 2);
});

test('overview keeps pixel-stable points and does not rebuild textures each tick', () => {
  const dataSource = new Cesium.CustomDataSource('solar-system-test');
  const epochMs = Date.UTC(2026, 0, 1);
  const first = syncSolarEntities({
    dataSource,
    epochMs,
    focusedBodyId: null,
    showAssets: false,
  });
  const mars = dataSource.entities.getById(`${BODY_ENTITY_PREFIX}mars`);
  assert.ok(mars);
  assert.equal(shown(mars.point), true);
  assert.equal(shown(mars.ellipsoid), false);
  const firstMaterial = mars.ellipsoid?.material;
  const firstCount = dataSource.entities.values.length;
  const second = syncSolarEntities({
    dataSource,
    epochMs: epochMs + 1000,
    focusedBodyId: null,
    showAssets: false,
  });
  assert.equal(second, first);
  assert.equal(dataSource.entities.values.length, firstCount);
  assert.equal(dataSource.entities.getById(`${BODY_ENTITY_PREFIX}mars`), mars);
  assert.equal(mars.ellipsoid?.material, firstMaterial);
});

test('entering a body adds a textured ellipsoid without dropping the parent', () => {
  const dataSource = new Cesium.CustomDataSource('solar-system-enter');
  const epochMs = Date.UTC(2026, 0, 1);
  syncSolarEntities({
    dataSource,
    epochMs,
    focusedBodyId: null,
    showAssets: false,
  });
  syncSolarEntities({
    dataSource,
    epochMs,
    focusedBodyId: 'phobos',
    showAssets: true,
  });
  const mars = dataSource.entities.getById(`${BODY_ENTITY_PREFIX}mars`);
  const phobos = dataSource.entities.getById(`${BODY_ENTITY_PREFIX}phobos`);
  assert.equal(shown(mars.point), false);
  assert.equal(shown(phobos.point), false);
  assert.equal(mars.position.isConstant, false);
  assert.equal(phobos.position.isConstant, false);
  syncSolarEntities({
    dataSource,
    epochMs: epochMs + 1000,
    focusedBodyId: 'phobos',
    showAssets: true,
  });
  assert.equal(dataSource.entities.getById(`${BODY_ENTITY_PREFIX}mars`), mars);
  assert.equal(typeof mars.position.setValue, 'undefined');
});

test('picks and flies to spacecraft, and draws Saturn rings only when entered', () => {
  assert.equal(pickSolarAssetId({ id: `${ASSET_ENTITY_PREFIX}curiosity` }), 'curiosity');
  assert.equal(pickSolarBodyId({ id: `${BODY_ENTITY_PREFIX}mars` }), 'mars');
  assert.equal(
    pickSolarBodyId({ id: `${BODY_ENTITY_PREFIX}mars${GLOBE_ENTITY_SUFFIX}` }),
    'mars',
  );
  const lookAtCalls = [];
  const viewer = {
    scene: { requestRender() {} },
    camera: {
      lookAtTransform(transform, hpr) {
        lookAtCalls.push({
          range: hpr.range,
          translation: Cesium.Matrix4.getTranslation(
            transform,
            new Cesium.Cartesian3(),
          ),
        });
      },
    },
  };
  assert.equal(flyToSolarAsset(viewer, 'curiosity', Date.UTC(2026, 0, 1)), true);
  assert.equal(lookAtCalls.length, 1);
  assert.ok(lookAtCalls[0].range > 0);
  assert.ok(
    Cesium.Cartesian3.magnitude(lookAtCalls[0].translation) > 0,
  );
  assert.equal(flyToSolarAsset(viewer, 'jwst', Date.UTC(2026, 0, 1)), true);
  assert.ok(lookAtCalls[1].range > 1_000_000_000);
  assert.ok(lookAtCalls[1].range < SYSTEM_OVERVIEW_RANGE_M * 0.01);

  const dataSource = new Cesium.CustomDataSource('solar-rings');
  syncSolarEntities({
    dataSource,
    epochMs: Date.UTC(2026, 0, 1),
    focusedBodyId: 'saturn',
    selectedAssetId: null,
    showAssets: false,
  });
  assert.ok(dataSource.entities.getById(`${RING_ENTITY_PREFIX}0`));
  assert.ok(dataSource.entities.getById(`${RING_ENTITY_PREFIX}3`));
  syncSolarEntities({
    dataSource,
    epochMs: Date.UTC(2026, 0, 1),
    focusedBodyId: 'mars',
    selectedAssetId: 'curiosity',
    showAssets: true,
  });
  assert.equal(dataSource.entities.getById(`${RING_ENTITY_PREFIX}0`), undefined);
  const curiosity = dataSource.entities.getById(`${ASSET_ENTITY_PREFIX}curiosity`);
  assert.equal(curiosity?.gevSelected, true);
  assert.equal(curiosity.point.pixelSize, 16);
  assert.ok(dataSource.entities.getById(`${ORBIT_ENTITY_PREFIX}sat-maven`));
  assert.ok(dataSource.entities.getById(`${ORBIT_ENTITY_PREFIX}sat-mro`));
});
