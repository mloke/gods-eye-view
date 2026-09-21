import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureEarthScene,
  enterSolarSystemBody,
  enterSolarSystemOverview,
  exitSolarSystem,
  hideEarthGlobe,
  isSolarSystemRegimeActive,
  resetSceneRegimeForTest,
  restoreEarthScene,
} from './sceneRegime.js';

function mockViewer({ globeShow = true } = {}) {
  const primitives = [];
  return {
    scene: {
      globe: { show: globeShow, depthTestAgainstTerrain: true },
      fog: { enabled: true },
      skyAtmosphere: { show: true },
      screenSpaceCameraController: {
        maximumZoomDistance: 1e7,
        minimumZoomDistance: 1,
      },
      primitives: {
        get length() {
          return primitives.length;
        },
        get(index) {
          return primitives[index];
        },
      },
    },
    camera: {},
  };
}

test('enter hides the Earth globe and exit restores it', () => {
  resetSceneRegimeForTest();
  const viewer = mockViewer({ globeShow: true });
  assert.equal(isSolarSystemRegimeActive(), false);
  enterSolarSystemOverview(viewer);
  assert.equal(isSolarSystemRegimeActive(), true);
  assert.equal(viewer.scene.globe.show, false);
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, false);
  assert.equal(viewer.scene.fog.enabled, false);
  assert.equal(viewer.scene.skyAtmosphere.show, false);
  exitSolarSystem(viewer, { restoreGlobeView: false });
  assert.equal(isSolarSystemRegimeActive(), false);
  assert.equal(viewer.scene.globe.show, true);
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, true);
  assert.equal(viewer.scene.fog.enabled, true);
  assert.equal(viewer.scene.skyAtmosphere.show, true);
  assert.equal(viewer.scene.screenSpaceCameraController.maximumZoomDistance, 1e7);
});

test('entering a body keeps the Earth globe hidden', () => {
  resetSceneRegimeForTest();
  const viewer = mockViewer();
  enterSolarSystemBody(viewer, 'mars');
  assert.equal(isSolarSystemRegimeActive(), true);
  hideEarthGlobe(viewer);
  assert.equal(viewer.scene.globe.show, false);
  exitSolarSystem(viewer, { restoreGlobeView: false });
});

test('capture and restore keep photoreal-hidden globe state', () => {
  resetSceneRegimeForTest();
  const viewer = mockViewer({ globeShow: false });
  const captured = captureEarthScene(viewer);
  viewer.scene.globe.show = true;
  restoreEarthScene(viewer, captured);
  assert.equal(viewer.scene.globe.show, false);
});

test('hiding Earth tilesets also disables preload-when-hidden requests', () => {
  resetSceneRegimeForTest();
  const tileset = { show: true, preloadWhenHidden: true };
  hideEarthGlobe(mockViewer(), {
    tilesets: [{ primitive: tileset, show: true }],
  });
  assert.equal(tileset.show, false);
  assert.equal(tileset.preloadWhenHidden, false);
  resetSceneRegimeForTest();
});
