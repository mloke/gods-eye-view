/**
 * Click-to-draw a watch-zone ring on the globe.
 *
 * Holds the shared pointer while a session is open so layer selection does not
 * steal vertices, and borrows Cesium's stock click/double-click the same way
 * the whiteboard Draw tool does.
 */
import * as Cesium from 'cesium';
import {
  claimPointer,
  pointerOwner,
  releasePointer,
} from '../../data/inputOwnership.js';
import {
  addFenceDrawVertex,
  createFenceDrawSession,
  fenceDrawHint,
  finishFenceDrawRing,
  GEOFENCE_DRAW_MAX_VERTICES,
  removeFenceDrawVertex,
} from './records.js';

export const GEOFENCE_DRAW_POINTER_OWNER = 'geofence-draw';
const PREVIEW_DATA_SOURCE_NAME = 'gev-geofence-draw';
const STROKE = '#39d0ff';
const MIN_PICK_MAGNITUDE_M = 6_000_000;
const MAX_PICK_MAGNITUDE_M = 1_000_000_000;

function isFiniteCart(position) {
  if (!position) return false;
  const magnitude = Math.hypot(position.x, position.y, position.z);
  return (
    Number.isFinite(magnitude) &&
    magnitude >= MIN_PICK_MAGNITUDE_M &&
    magnitude <= MAX_PICK_MAGNITUDE_M
  );
}

function pickLonLat(viewer, position) {
  const scene = viewer?.scene;
  if (!scene || !position) return null;
  let cart = null;
  if (scene.pickPositionSupported) {
    try {
      cart = scene.pickPosition(position);
    } catch {
      cart = null;
    }
  }
  if (!isFiniteCart(cart) && typeof viewer.camera?.getPickRay === 'function') {
    try {
      const ray = viewer.camera.getPickRay(position);
      cart = ray ? scene.globe?.pick?.(ray, scene) : null;
    } catch {
      cart = null;
    }
  }
  if (
    !isFiniteCart(cart) &&
    typeof viewer.camera?.pickEllipsoid === 'function'
  ) {
    try {
      cart = viewer.camera.pickEllipsoid(position, scene.globe?.ellipsoid);
    } catch {
      cart = null;
    }
  }
  if (!isFiniteCart(cart)) return null;
  let geodetic;
  try {
    geodetic = Cesium.Cartographic.fromCartesian(cart);
  } catch {
    return null;
  }
  if (!geodetic) return null;
  return {
    lon: Cesium.Math.toDegrees(geodetic.longitude),
    lat: Cesium.Math.toDegrees(geodetic.latitude),
    height: Number.isFinite(geodetic.height) ? geodetic.height : 0,
  };
}

/** Own one map-draw session for a watch zone. */
export function createGeofenceZoneDrawer({ viewer } = {}) {
  if (!viewer) throw new TypeError('Geofence zone drawer requires a viewer');

  let destroyed = false;
  let active = false;
  let session = null;
  let lease = null;
  let handler = null;
  let savedSingleClick = null;
  let savedDoubleClick = null;
  let cursor = null;
  let dataSource = null;
  let previewLine = null;
  let vertexEntities = [];
  let hint = '';
  let finishedFence = null;
  let getName = null;
  let onFinish = null;
  const listeners = new Set();
  const removers = [];

  function state() {
    return {
      active,
      hint,
      vertexCount: session?.vertices?.length || 0,
      finishedFence,
    };
  }

  function emit() {
    const snapshot = state();
    for (const listener of listeners) listener(snapshot);
  }

  function setHint(text) {
    hint = text || '';
    emit();
  }

  function requestRender() {
    viewer.scene?.requestRender?.();
  }

  function ensureDataSource() {
    if (
      dataSource ||
      !viewer.dataSources ||
      typeof Cesium.CustomDataSource !== 'function'
    )
      return;
    dataSource = new Cesium.CustomDataSource(PREVIEW_DATA_SOURCE_NAME);
    dataSource.show = false;
    const added = viewer.dataSources.add(dataSource);
    if (typeof added?.catch === 'function') added.catch(() => null);
  }

  function vertexPositions() {
    return (session?.vertices || []).map((vertex) =>
      Cesium.Cartesian3.fromDegrees(vertex.lon, vertex.lat, vertex.height || 0),
    );
  }

  function syncPreview() {
    if (destroyed || !dataSource) return;
    for (const entity of vertexEntities) dataSource.entities.remove(entity);
    vertexEntities = [];
    if (!session || !active) {
      if (previewLine) previewLine.show = false;
      if (dataSource) dataSource.show = false;
      requestRender();
      return;
    }
    dataSource.show = true;
    const stroke = Cesium.Color.fromCssColorString(STROKE);
    if (!previewLine) {
      previewLine = dataSource.entities.add({
        show: true,
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            if (!session) return [];
            const points = vertexPositions();
            if (cursor) points.push(cursor);
            if (points.length >= 3) points.push(points[0]);
            return points;
          }, false),
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: stroke.withAlpha(0.9),
            dashLength: 16,
          }),
          clampToGround: true,
        },
      });
    }
    previewLine.show = true;
    for (const vertex of session.vertices) {
      vertexEntities.push(
        dataSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            vertex.lon,
            vertex.lat,
            vertex.height || 0,
          ),
          point: {
            pixelSize: 8,
            color: stroke,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.6),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
    requestRender();
  }

  function typingElsewhere(event) {
    const target = event.target;
    if (!target) return false;
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );
  }

  function enterBelongsToDrawing(event) {
    const target = event.target;
    if (!target) return true;
    if (
      typeof target.closest === 'function' &&
      target.closest('button, a, select, [role="button"]')
    )
      return false;
    return (
      target === document.body ||
      target === viewer.scene?.canvas ||
      target.tagName === 'CANVAS' ||
      target.id === 'watch-zone-name'
    );
  }

  function finish() {
    if (!active || !session) return null;
    const ring = finishFenceDrawRing(session);
    if (!ring) {
      setHint(
        session.vertices.length < 3
          ? fenceDrawHint(session)
          : 'That shape is too thin — add another corner.',
      );
      return null;
    }
    const name =
      typeof getName === 'function'
        ? getName()
        : typeof getName === 'string'
          ? getName
          : '';
    const finishCb = onFinish;
    stop(false);
    const fence = finishCb?.(ring, name) || null;
    finishedFence = fence;
    hint = '';
    emit();
    return fence;
  }

  function onClick(event) {
    if (!session || !active || destroyed) return;
    const point = pickLonLat(viewer, event.position);
    if (!point) {
      setHint('That point is off the globe — click on the world.');
      return;
    }
    const { added, reason } = addFenceDrawVertex(session, point);
    if (added) {
      setHint(fenceDrawHint(session));
      syncPreview();
      return;
    }
    if (reason === 'full')
      setHint(
        `That zone already has ${GEOFENCE_DRAW_MAX_VERTICES} corners — finish it or press Backspace.`,
      );
    else if (reason === 'invalid')
      setHint('That point is off the globe — click on the world.');
  }

  function onMove(event) {
    if (!session || !active || destroyed) return;
    const point = pickLonLat(viewer, event.endPosition);
    cursor = point
      ? Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.height || 0)
      : null;
    requestRender();
  }

  function onKey(event) {
    if (!active || destroyed || typingElsewhere(event)) return;
    if (event.key === 'Enter') {
      if (session?.vertices?.length && enterBelongsToDrawing(event)) {
        event.preventDefault();
        finish();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      stop(true);
      return;
    }
    if (event.key === 'Backspace' && event.target?.id !== 'watch-zone-name') {
      if (removeFenceDrawVertex(session)) {
        event.preventDefault();
        setHint(fenceDrawHint(session));
        syncPreview();
      }
    }
  }

  function bindHandler() {
    if (handler || typeof Cesium.ScreenSpaceEventHandler !== 'function') return;
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction(onClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(onMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction(() => {
      finish();
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    const stock = viewer.screenSpaceEventHandler;
    if (stock?.getInputAction && stock.removeInputAction) {
      savedSingleClick =
        stock.getInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK) || null;
      savedDoubleClick =
        stock.getInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK) ||
        null;
      stock.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
      stock.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }
    document.addEventListener('keydown', onKey, true);
    removers.push(() => document.removeEventListener('keydown', onKey, true));
  }

  function releaseHandler() {
    if (handler) {
      handler.destroy();
      handler = null;
    }
    const stock = viewer.screenSpaceEventHandler;
    if (savedSingleClick && stock?.setInputAction) {
      stock.setInputAction(
        savedSingleClick,
        Cesium.ScreenSpaceEventType.LEFT_CLICK,
      );
    }
    if (savedDoubleClick && stock?.setInputAction) {
      stock.setInputAction(
        savedDoubleClick,
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
      );
    }
    savedSingleClick = null;
    savedDoubleClick = null;
    for (const remove of removers.splice(0)) remove();
  }

  function stop(cancelled) {
    if (!active && !session) return;
    active = false;
    session = null;
    cursor = null;
    getName = null;
    onFinish = null;
    releaseHandler();
    releasePointer(lease);
    lease = null;
    syncPreview();
    hint = cancelled ? '' : hint;
    if (cancelled) finishedFence = null;
    emit();
  }

  return {
    getState: state,
    isActive() {
      return active;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(options = {}) {
      if (destroyed) return { started: false, reason: 'destroyed' };
      if (active) return { started: true };
      if (
        typeof Cesium.ScreenSpaceEventHandler !== 'function' ||
        !viewer.scene?.canvas
      )
        return { started: false, reason: 'no-canvas' };
      lease = claimPointer(GEOFENCE_DRAW_POINTER_OWNER);
      if (!lease) {
        return {
          started: false,
          reason: 'pointer-busy',
          owner: pointerOwner(),
        };
      }
      finishedFence = null;
      getName = options.getName ?? null;
      onFinish =
        typeof options.onFinish === 'function' ? options.onFinish : null;
      session = createFenceDrawSession();
      active = true;
      ensureDataSource();
      bindHandler();
      syncPreview();
      setHint(fenceDrawHint(session));
      return { started: true };
    },
    cancel() {
      stop(true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop(true);
      if (dataSource) {
        viewer.dataSources?.remove(dataSource, true);
        dataSource = null;
      }
      previewLine = null;
      vertexEntities = [];
      listeners.clear();
    },
  };
}
