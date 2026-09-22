import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  SOLAR_CAMERA_FAR_M,
  SOLAR_CAMERA_NEAR_M,
} from './scale.js';
import {
  applySolarCameraController,
  attachSolarCameraControls,
  captureSolarCameraController,
  getSolarLookAtTarget,
  lookAtSolarTarget,
  panSolarLookAt,
  resetSolarCameraForTest,
  restoreSolarCameraController,
} from './camera.js';

function mockViewer(overrides = {}) {
  const controller = {
    enableTilt: false,
    enableCollisionDetection: true,
    enableTranslate: true,
    enableLook: false,
    minimumZoomDistance: 1,
    maximumZoomDistance: 1e7,
    minimumTrackBallHeight: 7.5e6,
    minimumPickingTerrainHeight: 150000,
    minimumCollisionTerrainHeight: 15000,
    rotateEventTypes: 'left',
    zoomEventTypes: 'wheel',
    tiltEventTypes: 'middle',
    lookEventTypes: 'shift',
    translateEventTypes: 'left',
  };
  const lookAtCalls = [];
  return {
    lookAtCalls,
    scene: {
      canvas: { clientHeight: 800, height: 800 },
      requestRender() {},
      screenSpaceCameraController: controller,
    },
    camera: {
      heading: 0.2,
      pitch: -0.4,
      constrainedAxis: Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z),
      positionWC: new Cesium.Cartesian3(0, -4_000_000, 8_000_000),
      right: new Cesium.Cartesian3(1, 0, 0),
      up: new Cesium.Cartesian3(0, 1, 0),
      frustum: { fovy: Cesium.Math.toRadians(60), near: 1, far: 1e8 },
      lookAt() {},
      lookAtTransform(transform, hpr) {
        lookAtCalls.push({
          transform,
          hpr,
          translation: Cesium.Matrix4.getTranslation(
            transform,
            new Cesium.Cartesian3(),
          ),
        });
      },
    },
    ...overrides,
  };
}

test('solar camera frees tilt and disables ellipsoid collision', () => {
  resetSolarCameraForTest();
  const viewer = mockViewer();
  const captured = captureSolarCameraController(viewer);
  applySolarCameraController(viewer);
  const controller = viewer.scene.screenSpaceCameraController;
  assert.equal(controller.enableTilt, true);
  assert.equal(controller.enableCollisionDetection, false);
  assert.equal(controller.minimumPickingTerrainHeight, Number.POSITIVE_INFINITY);
  restoreSolarCameraController(viewer, captured);
  assert.equal(controller.enableTilt, false);
  assert.equal(controller.enableCollisionDetection, true);
  assert.equal(controller.maximumZoomDistance, 1e7);
  resetSolarCameraForTest();
});

test('solar camera drops Earth north constraint and widens the frustum', () => {
  resetSolarCameraForTest();
  const viewer = mockViewer();
  const captured = captureSolarCameraController(viewer);
  applySolarCameraController(viewer);
  assert.equal(viewer.camera.constrainedAxis, undefined);
  assert.equal(viewer.camera.frustum.near, SOLAR_CAMERA_NEAR_M);
  assert.equal(viewer.camera.frustum.far, SOLAR_CAMERA_FAR_M);
  restoreSolarCameraController(viewer, captured);
  assert.equal(viewer.camera.constrainedAxis.z, 1);
  assert.equal(viewer.camera.frustum.near, 1);
  resetSolarCameraForTest();
});

test('look-at locks a movable pivot instead of hidden Earth', () => {
  resetSolarCameraForTest();
  const viewer = mockViewer();
  applySolarCameraController(viewer);
  const target = new Cesium.Cartesian3(1_000_000, 0, 0);
  assert.equal(lookAtSolarTarget(viewer, target, 3_000_000, { heading: 0.1, pitch: -0.5 }), true);
  assert.equal(viewer.lookAtCalls.length, 1);
  assert.equal(viewer.lookAtCalls[0].translation.x, 1_000_000);
  assert.ok(getSolarLookAtTarget());
  assert.equal(panSolarLookAt(viewer, 40, 0), true);
  assert.ok(viewer.lookAtCalls.length >= 2);
  assert.notEqual(getSolarLookAtTarget().x, 1_000_000);
  resetSolarCameraForTest();
});

test('solar pan binds button down/move, not CameraEventType drag aliases', () => {
  resetSolarCameraForTest();
  assert.equal(
    Cesium.ScreenSpaceEventType.RIGHT_DRAG,
    undefined,
    'RIGHT_DRAG is a CameraEventType; using it on ScreenSpaceEventHandler throws',
  );
  const viewer = mockViewer();
  lookAtSolarTarget(viewer, new Cesium.Cartesian3(0, 0, 0), 3_000_000);
  const actions = new Map();
  const handler = attachSolarCameraControls(viewer, () => ({
    setInputAction(fn, type) {
      if (type == null) throw new Error('type is required');
      actions.set(type, fn);
    },
    destroy() {},
  }));
  assert.ok(handler);
  assert.equal(
    actions.has(Cesium.ScreenSpaceEventType.RIGHT_DOWN),
    true,
  );
  assert.equal(
    actions.has(Cesium.ScreenSpaceEventType.MOUSE_MOVE),
    true,
  );
  const before = getSolarLookAtTarget().x;
  actions.get(Cesium.ScreenSpaceEventType.MOUSE_MOVE)({
    startPosition: { x: 0, y: 0 },
    endPosition: { x: 40, y: 0 },
  });
  assert.equal(getSolarLookAtTarget().x, before, 'move without a button does not pan');
  actions.get(Cesium.ScreenSpaceEventType.RIGHT_DOWN)();
  actions.get(Cesium.ScreenSpaceEventType.MOUSE_MOVE)({
    startPosition: { x: 0, y: 0 },
    endPosition: { x: 40, y: 0 },
  });
  assert.notEqual(getSolarLookAtTarget().x, before);
  resetSolarCameraForTest();
});
