import * as Cesium from 'cesium';

let controllerSnapshot = null;
let lookAtTarget = null;
let inputHandler = null;

const CONTROLLER_FIELDS = Object.freeze([
  'enableTilt',
  'enableCollisionDetection',
  'enableTranslate',
  'enableLook',
  'minimumZoomDistance',
  'maximumZoomDistance',
  'minimumTrackBallHeight',
  'minimumPickingTerrainHeight',
  'minimumCollisionTerrainHeight',
  'rotateEventTypes',
  'zoomEventTypes',
  'tiltEventTypes',
  'lookEventTypes',
  'translateEventTypes',
]);

function cloneControllerState(controller) {
  if (!controller) return null;
  const state = {};
  for (const field of CONTROLLER_FIELDS) state[field] = controller[field];
  return state;
}

function writeControllerState(controller, state) {
  if (!controller || !state) return;
  for (const field of CONTROLLER_FIELDS) {
    if (state[field] !== undefined) controller[field] = state[field];
  }
}

/** Current look-at pivot, or null when the Earth camera owns the scene. */
export function getSolarLookAtTarget() {
  return lookAtTarget;
}

/**
 * Capture Earth camera-controller flags so Solar System can restore them.
 * @param {object} viewer
 * @returns {object|null}
 */
export function captureSolarCameraController(viewer) {
  const state = cloneControllerState(viewer?.scene?.screenSpaceCameraController);
  const camera = viewer?.camera;
  if (state && camera) {
    const frustum = camera.frustum;
    if (frustum) {
      state.frustumNear = frustum.near;
      state.frustumFar = frustum.far;
    }
    state.constrainedAxis = camera.constrainedAxis
      ? Cesium.Cartesian3.clone(camera.constrainedAxis)
      : null;
  }
  return state;
}

/**
 * Free the camera from the hidden WGS84 ellipsoid: tilt, no collision, and
 * rotate/zoom around an explicit look-at instead of a globe pick.
 * @param {object} viewer
 */
export function applySolarCameraController(viewer) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  if (!controller) return;
  if (!controllerSnapshot)
    controllerSnapshot = captureSolarCameraController(viewer);
  controller.enableTilt = true;
  controller.enableCollisionDetection = false;
  controller.enableTranslate = false;
  controller.enableLook = false;
  controller.minimumZoomDistance = 2_000;
  controller.maximumZoomDistance = 20_000_000_000;
  controller.minimumTrackBallHeight = 0;
  controller.minimumPickingTerrainHeight = Number.POSITIVE_INFINITY;
  controller.minimumCollisionTerrainHeight = Number.POSITIVE_INFINITY;
  controller.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
  controller.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH,
  ];
  controller.tiltEventTypes = [
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.CTRL,
    },
    Cesium.CameraEventType.PINCH,
  ];
  controller.lookEventTypes = undefined;
  controller.translateEventTypes = undefined;
  const camera = viewer?.camera;
  if (camera) camera.constrainedAxis = undefined;
  const frustum = camera?.frustum;
  if (frustum && Number.isFinite(frustum.near)) {
    frustum.near = 10_000;
    frustum.far = 50_000_000_000;
  }
}

/**
 * Restore Earth camera-controller flags and release the look-at lock.
 * @param {object} viewer
 * @param {object|null} [captured]
 */
export function restoreSolarCameraController(viewer, captured = controllerSnapshot) {
  const camera = viewer?.camera;
  if (camera && !viewer.isDestroyed?.()) {
    camera.lookAtTransform?.(Cesium.Matrix4.IDENTITY);
  }
  writeControllerState(viewer?.scene?.screenSpaceCameraController, captured);
  if (camera && captured && 'constrainedAxis' in captured)
    camera.constrainedAxis = captured.constrainedAxis;
  const frustum = camera?.frustum;
  if (frustum && captured && Number.isFinite(captured.frustumNear)) {
    frustum.near = captured.frustumNear;
    if (Number.isFinite(captured.frustumFar)) frustum.far = captured.frustumFar;
  }
  controllerSnapshot = null;
  lookAtTarget = null;
}

/**
 * Orbit the camera around a world-space pivot. Left-drag then rotates about
 * that point instead of the invisible Earth ellipsoid.
 * @param {object} viewer
 * @param {object} target
 * @param {number} range
 * @param {{heading?: number, pitch?: number}} [orientation]
 */
function transformAt(target) {
  return Cesium.Matrix4.fromTranslation(target);
}

export function lookAtSolarTarget(
  viewer,
  target,
  range,
  { heading = 0, pitch = -0.45 } = {},
) {
  const camera = viewer?.camera;
  if (!camera || !target) return false;
  const nextRange = Math.max(2_000, Number(range) || 0);
  if (!Number.isFinite(nextRange)) return false;
  lookAtTarget = Cesium.Cartesian3.clone(target);
  camera.lookAtTransform(
    transformAt(lookAtTarget),
    new Cesium.HeadingPitchRange(heading, pitch, nextRange),
  );
  viewer.scene?.requestRender?.();
  return true;
}

function headingPitchRangeFromCamera(camera, target) {
  const offset = Cesium.Cartesian3.subtract(
    camera.positionWC,
    target,
    new Cesium.Cartesian3(),
  );
  const range = Math.max(2_000, Cesium.Cartesian3.magnitude(offset));
  return new Cesium.HeadingPitchRange(camera.heading, camera.pitch, range);
}

/**
 * Slide the look-at pivot in the camera's view plane so the operator can
 * re-center without being stuck on the Sun / hidden Earth.
 * @param {object} viewer
 * @param {number} dx
 * @param {number} dy
 */
export function panSolarLookAt(viewer, dx, dy) {
  const camera = viewer?.camera;
  const canvas = viewer?.scene?.canvas;
  if (!camera || !lookAtTarget || !canvas) return false;
  const height = canvas.clientHeight || canvas.height || 0;
  if (!(height > 0)) return false;
  const fovy =
    camera.frustum?.fovy || Cesium.Math.toRadians(60);
  const range = Math.max(
    2_000,
    Cesium.Cartesian3.distance(camera.positionWC, lookAtTarget),
  );
  const metersPerPixel = (2 * range * Math.tan(fovy * 0.5)) / height;
  const move = new Cesium.Cartesian3();
  Cesium.Cartesian3.multiplyByScalar(camera.right, -dx * metersPerPixel, move);
  Cesium.Cartesian3.add(lookAtTarget, move, lookAtTarget);
  Cesium.Cartesian3.multiplyByScalar(camera.up, dy * metersPerPixel, move);
  Cesium.Cartesian3.add(lookAtTarget, move, lookAtTarget);
  camera.lookAtTransform(
    transformAt(lookAtTarget),
    headingPitchRangeFromCamera(camera, lookAtTarget),
  );
  viewer.scene?.requestRender?.();
  return true;
}

/**
 * ScreenSpaceEventHandler speaks DOWN/UP/MOVE, not CameraEventType *DRAG.
 * Binding RIGHT_DRAG throws DeveloperError and aborts Solar System enable.
 */
function bindLookAtPan(handler, viewer) {
  let panButtons = 0;
  const onDown = () => {
    panButtons += 1;
  };
  const onUp = () => {
    panButtons = Math.max(0, panButtons - 1);
  };
  handler.setInputAction(onDown, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
  handler.setInputAction(onUp, Cesium.ScreenSpaceEventType.RIGHT_UP);
  handler.setInputAction(onDown, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
  handler.setInputAction(onUp, Cesium.ScreenSpaceEventType.MIDDLE_UP);
  handler.setInputAction((event) => {
    if (!panButtons) return;
    const start = event.startPosition;
    const end = event.endPosition;
    if (!start || !end) return;
    panSolarLookAt(viewer, end.x - start.x, end.y - start.y);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

/** Right-drag and middle-drag move the look-at center. */
export function attachSolarCameraControls(viewer, createHandler) {
  detachSolarCameraControls();
  const canvas = viewer?.scene?.canvas;
  if (!viewer || !canvas) return null;
  try {
    const handler =
      typeof createHandler === 'function'
        ? createHandler(canvas)
        : new Cesium.ScreenSpaceEventHandler(canvas);
    bindLookAtPan(handler, viewer);
    inputHandler = handler;
    return handler;
  } catch (error) {
    console.warn('[Solar] camera pan controls unavailable', error);
    return null;
  }
}

export function detachSolarCameraControls() {
  inputHandler?.destroy?.();
  inputHandler = null;
}

/** Test hook. */
export function resetSolarCameraForTest() {
  detachSolarCameraControls();
  controllerSnapshot = null;
  lookAtTarget = null;
}
