import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANGLED_VIEW_STORAGE_KEY,
  NADIR_PITCH_DEG,
  applyAngledViewController,
  isAngledViewAllowed,
  resolveCameraPitchDeg,
  setAngledViewAllowed,
} from './cameraTiltPolicy.js';
import {
  enterSolarSystemOverview,
  resetSceneRegimeForTest,
} from './solarSystem/sceneRegime.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('angled view is off until the allow switch is stored on', () => {
  const storage = memoryStorage();
  assert.equal(isAngledViewAllowed(storage), false);
  assert.equal(resolveCameraPitchDeg(-30, storage), NADIR_PITCH_DEG);
  setAngledViewAllowed(true, { storage });
  assert.equal(isAngledViewAllowed(storage), true);
  assert.equal(resolveCameraPitchDeg(-30, storage), -30);
  setAngledViewAllowed(false, { storage });
  assert.equal(storage.getItem(ANGLED_VIEW_STORAGE_KEY), '0');
  assert.equal(resolveCameraPitchDeg(-35, storage), NADIR_PITCH_DEG);
});

test('the camera controller cannot tilt while angled view is off', () => {
  resetSceneRegimeForTest();
  const viewer = { scene: { screenSpaceCameraController: { enableTilt: true } } };
  applyAngledViewController(viewer, false);
  assert.equal(viewer.scene.screenSpaceCameraController.enableTilt, false);
  applyAngledViewController(viewer, true);
  assert.equal(viewer.scene.screenSpaceCameraController.enableTilt, true);
});

test('Solar System keeps tilt on even when angled view is off', () => {
  resetSceneRegimeForTest();
  const viewer = {
    scene: {
      globe: { show: true },
      skyAtmosphere: { show: true },
      screenSpaceCameraController: {
        enableTilt: false,
        maximumZoomDistance: 1e7,
        minimumZoomDistance: 1,
      },
      primitives: { length: 0, get() { return null; } },
    },
    camera: { lookAtTransform() {} },
  };
  enterSolarSystemOverview(viewer);
  applyAngledViewController(viewer, false);
  assert.equal(viewer.scene.screenSpaceCameraController.enableTilt, true);
  resetSceneRegimeForTest();
});
