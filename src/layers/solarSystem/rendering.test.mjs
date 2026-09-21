import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  SYSTEM_OVERVIEW_HEADING,
  SYSTEM_OVERVIEW_PITCH,
  SYSTEM_OVERVIEW_RANGE_M,
} from '../../solarSystem/scale.js';
import { BODY_ENTITY_PREFIX } from './policy.js';
import { flyToSolarOverview, syncSolarEntities } from './rendering.js';

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
  assert.equal(shown(mars.ellipsoid), true);
  assert.equal(shown(phobos.ellipsoid), true);
  const material = mars.ellipsoid.material;
  const graphics = mars.ellipsoid;
  syncSolarEntities({
    dataSource,
    epochMs: epochMs + 1000,
    focusedBodyId: 'phobos',
    showAssets: true,
  });
  assert.equal(mars.ellipsoid, graphics);
  assert.equal(mars.ellipsoid.material, material);
  const before = Cesium.Cartesian3.clone(mars.position.getValue());
  let positionWrites = 0;
  const original = mars.position.setValue.bind(mars.position);
  mars.position.setValue = (value) => {
    positionWrites += 1;
    return original(value);
  };
  syncSolarEntities({
    dataSource,
    epochMs: epochMs + 2000,
    focusedBodyId: 'phobos',
    showAssets: true,
  });
  assert.equal(positionWrites, 0);
  assert.equal(Cesium.Cartesian3.equals(mars.position.getValue(), before), true);
});
