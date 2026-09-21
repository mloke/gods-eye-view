import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { claimPointer, releasePointer } from '../../data/inputOwnership.js';
import { formatLocationTagSnippet } from './records.js';
import { installLocationTagCopy, pickGroundCoordinates } from './copy.js';

function fakeHandler() {
  const actions = new Map();
  return {
    setInputAction(fn, type) {
      actions.set(type, fn);
    },
    destroy() {
      actions.clear();
    },
    actions,
  };
}

function fakeViewer(position) {
  const canvas = {
    listeners: new Map(),
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    },
    removeEventListener(type) {
      this.listeners.delete(type);
    },
  };
  return {
    scene: {
      canvas,
      pickPositionSupported: false,
    },
    camera: {
      pickEllipsoid: () => position,
    },
  };
}

test('pickGroundCoordinates returns degrees from a valid ellipsoid hit', () => {
  const position = Cesium.Cartesian3.fromDegrees(-117.1566, 32.7073);
  const coords = pickGroundCoordinates(fakeViewer(position), { x: 10, y: 12 });
  assert.ok(Math.abs(coords.lat - 32.7073) < 1e-4);
  assert.ok(Math.abs(coords.lon + 117.1566) < 1e-4);
});

test('pickGroundCoordinates treats sky and degenerate picks as a miss', () => {
  assert.equal(pickGroundCoordinates(fakeViewer(null), { x: 1, y: 1 }), null);
  assert.equal(
    pickGroundCoordinates(fakeViewer(new Cesium.Cartesian3(500, 0, 0)), {
      x: 1,
      y: 1,
    }),
    null,
  );
});

test('right-click copies a location-tags snippet and suppresses the browser menu', async () => {
  const position = Cesium.Cartesian3.fromDegrees(-117.1566, 32.7073);
  const viewer = fakeViewer(position);
  const handler = fakeHandler();
  const copied = [];
  const toasts = [];
  const control = installLocationTagCopy({
    viewer,
    showToast: (message) => toasts.push(message),
    writeText: async (text) => {
      copied.push(text);
    },
    screenSpaceEventHandlerFactory: () => handler,
  });
  const menu = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  viewer.scene.canvas.listeners.get('contextmenu')(menu);
  assert.equal(menu.defaultPrevented, true);
  await handler.actions.get(Cesium.ScreenSpaceEventType.RIGHT_CLICK)({
    position: { x: 10, y: 12 },
  });
  assert.equal(copied.length, 1);
  assert.equal(
    copied[0],
    formatLocationTagSnippet({ lat: 32.7073, lon: -117.1566 }),
  );
  assert.match(toasts.at(-1), /Copied 32\.70730, -117\.15660/);
  control.destroy();
  assert.equal(viewer.scene.canvas.listeners.has('contextmenu'), false);
});

test('right-click does not copy while another tool owns the pointer', async () => {
  const position = Cesium.Cartesian3.fromDegrees(-117.1566, 32.7073);
  const viewer = fakeViewer(position);
  const handler = fakeHandler();
  const copied = [];
  const lease = claimPointer('draw');
  try {
    installLocationTagCopy({
      viewer,
      writeText: async (text) => {
        copied.push(text);
      },
      screenSpaceEventHandlerFactory: () => handler,
    });
    await handler.actions.get(Cesium.ScreenSpaceEventType.RIGHT_CLICK)({
      position: { x: 10, y: 12 },
    });
    assert.deepEqual(copied, []);
  } finally {
    releasePointer(lease);
  }
});
