import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  GEOFENCE_WATCH_INTERVAL_MS,
  GEOFENCE_WATCH_OVERLAY_COLLISION_CAPACITY,
  GEOFENCE_WATCH_OVERLAY_COHORT_LIMIT,
  GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
  createGeofenceWatchOverlayEntry,
  createGeofenceWatchSelectedOverlayEntry,
  eventColor,
  fenceColor,
  selectGeofenceWatchOverlayCohort,
} from './model.js';
import { createGeofenceWatch } from './watch.js';
import { createGeofenceZoneDrawer } from './draw.js';
export * from './model.js';
export { createGeofenceWatchSource } from './source.js';
export { createGeofenceWatch } from './watch.js';
export {
  createGeofenceZoneDrawer,
  GEOFENCE_DRAW_POINTER_OWNER,
} from './draw.js';
export {
  createDrawnGeofence,
  createGeofenceEvent,
  normalizeGeofence,
  normalizeGeofences,
  pointInFenceRing,
} from './records.js';

const FENCE_PREFIX = 'geofence:';
const EVENT_PREFIX = 'watch:';

function closedDegrees(ring) {
  const coords = [];
  for (const [lon, lat] of ring) coords.push(lon, lat);
  if (ring.length) {
    const [lon, lat] = ring[0];
    coords.push(lon, lat);
  }
  return coords;
}

/** Own one geofence-watch display, its poll lifecycle, and the event log. */
export function createGeofenceWatchLayer({
  fenceSource,
  eventSources,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
  storage = globalThis.localStorage,
  watchFactory = createGeofenceWatch,
} = {}) {
  if (typeof fenceSource?.getSnapshot !== 'function')
    throw new TypeError('Geofence watch requires a fence snapshot source');
  if (!overlayHost)
    throw new TypeError('Geofence watch requires an overlay host');

  const watch = watchFactory({ fenceSource, eventSources, storage });
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;
  let _selectedId = null;
  let _events = [];
  let _fences = [];
  let _clickHandler = null;
  let _unsubscribe = null;
  let _drawer = null;

  function fenceEntityId(stableId) {
    return `${FENCE_PREFIX}${stableId}`;
  }

  function eventEntityId(id) {
    return `${EVENT_PREFIX}${id}`;
  }

  function publishOverlays(events) {
    const overlayEntries = [];
    for (const event of events) {
      const entity = _dataSource?.entities.getById(eventEntityId(event.id));
      const position = entity?.position?.getValue(Cesium.JulianDate.now());
      if (!position) continue;
      const selected = event.id === _selectedId;
      overlayEntries.push(
        (selected
          ? createGeofenceWatchSelectedOverlayEntry
          : createGeofenceWatchOverlayEntry)({
          id: event.id,
          position,
          record: event,
        }),
      );
    }
    overlayHost.setEntries(
      GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
      selectGeofenceWatchOverlayCohort(overlayEntries),
      {
        cohortLimit: GEOFENCE_WATCH_OVERLAY_COHORT_LIMIT,
        collisionCapacity: GEOFENCE_WATCH_OVERLAY_COLLISION_CAPACITY,
        moving: false,
      },
    );
  }

  function registerContexts(events) {
    if (typeof context?.registerEntityContext !== 'function') return;
    context.removeEntityContextsForLayer?.(GEOFENCE_WATCH_OVERLAY_SOURCE_ID);
    for (const event of events) {
      const entity = _dataSource?.entities.getById(eventEntityId(event.id));
      if (!entity) continue;
      context.registerEntityContext(entity, {
        id: event.id,
        layerId: GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
        layerName: 'Geofence Watch',
        source: event.sourceLabel || event.sourceId,
        label: event.title,
        latitude: event.lat,
        longitude: event.lon,
        properties: {
          fenceName: event.fenceName,
          offense: event.title,
          category: event.category,
          neighborhood: event.neighborhood,
          blockAddress: event.blockAddress,
          caseNumber: event.caseNumber,
          occurredOnMs: event.occurredOnMs,
          violent: event.violent,
          property: event.property,
        },
      });
    }
  }

  function selectEvent(eventId) {
    _selectedId = eventId || null;
    if (_selectedId && _enabled) publishOverlays(_events);
    const entity = _selectedId
      ? _dataSource?.entities.getById(eventEntityId(_selectedId))
      : null;
    if (entity) context?.selectEntityContext?.(entity);
    else
      context?.clearSelectedEntityContextForLayer?.(
        GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
      );
  }

  function pickedEventId(picked) {
    const id = typeof picked?.id?.id === 'string' ? picked.id.id : '';
    if (id.startsWith(EVENT_PREFIX)) return id.slice(EVENT_PREFIX.length);
    return null;
  }

  function installClickHandler() {
    if (
      _clickHandler ||
      !_viewer ||
      typeof screenSpaceEventHandlerFactory !== 'function'
    )
      return;
    _clickHandler = screenSpaceEventHandlerFactory(_viewer);
    _clickHandler.setInputAction((click) => {
      if (!isPointerFree() || !_enabled) return;
      const picked = _viewer.scene.pick(click.position);
      const fromEntity = pickedEventId(picked);
      if (fromEntity) {
        selectEvent(fromEntity);
        return;
      }
      const cardHit = overlayHost.hitTest?.(
        click.position?.x,
        click.position?.y,
        { sourceId: GEOFENCE_WATCH_OVERLAY_SOURCE_ID },
      );
      if (cardHit?.entryId) {
        selectEvent(cardHit.entryId);
        return;
      }
      if (picked) return;
      selectEvent(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    _clickHandler?.destroy?.();
    _clickHandler = null;
  }

  function paint(fences, events) {
    if (!_dataSource) return;
    const nextEntities = [];
    for (const fence of fences) {
      const color = fenceColor(fence);
      const hierarchy = Cesium.Cartesian3.fromDegreesArray(
        closedDegrees(fence.ring),
      );
      nextEntities.push(
        new Cesium.Entity({
          id: fenceEntityId(fence.stableId),
          polygon: {
            hierarchy,
            material: color.withAlpha(0.16),
            outline: false,
            height: 0,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          polyline: {
            positions: hierarchy,
            width: 2,
            material: color.withAlpha(0.9),
            clampToGround: true,
          },
        }),
      );
    }
    for (const event of events) {
      const color = eventColor(event);
      nextEntities.push(
        new Cesium.Entity({
          id: eventEntityId(event.id),
          position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat),
          point: {
            pixelSize: event.violent ? 10 : 8,
            color: color.withAlpha(event.violent ? 0.95 : 0.8),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    }
    _dataSource.entities.removeAll();
    for (const entity of nextEntities) _dataSource.entities.add(entity);
    _fences = fences;
    _events = events;
    if (_selectedId && !events.some((event) => event.id === _selectedId))
      _selectedId = null;
    if (_enabled) {
      publishOverlays(events);
      registerContexts(events);
    }
    _count = events.length;
  }

  const layer = {
    id: GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
    name: 'Geofence Watch',
    icon: '▣',
    source: 'config/geofences.json',
    updateInterval: GEOFENCE_WATCH_INTERVAL_MS,

    init(viewer) {
      if (_viewer)
        throw new Error('Geofence watch layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(
        GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
      );
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      _selectedId = null;
      _events = [];
      _fences = [];
      overlayHost.setVisible(GEOFENCE_WATCH_OVERLAY_SOURCE_ID, false);
      _drawer = createGeofenceZoneDrawer({ viewer });
      _unsubscribe = watch.subscribe((next) => {
        if (!_enabled || !_dataSource) return;
        paint(next.fences, next.events);
        _lastUpdate = next.lastUpdate;
        _lastError = next.lastError;
      });
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(GEOFENCE_WATCH_OVERLAY_SOURCE_ID, true);
      installClickHandler();
      const next = watch.getState();
      paint(next.fences, next.events);
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _selectedId = null;
      removeClickHandler();
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(GEOFENCE_WATCH_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(GEOFENCE_WATCH_OVERLAY_SOURCE_ID, false);
      context?.clearSelectedEntityContextForLayer?.(
        GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
      );
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        await watch.refresh({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        const next = watch.getState();
        paint(next.fences, next.events);
        _lastUpdate = next.lastUpdate;
        _lastError = null;
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:GeofenceWatch] Fetch error:', error);
        _lastError = error?.message || 'Geofence watch unavailable';
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      _selectedId = null;
      removeClickHandler();
      _drawer?.destroy();
      _drawer = null;
      _unsubscribe?.();
      _unsubscribe = null;
      overlayHost.clearSource(GEOFENCE_WATCH_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(GEOFENCE_WATCH_OVERLAY_SOURCE_ID, false);
      context?.clearSelectedEntityContextForLayer?.(
        GEOFENCE_WATCH_OVERLAY_SOURCE_ID,
      );
      if (_dataSource) {
        viewer?.dataSources?.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _events = [];
      _fences = [];
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
    },

    selectEvent,
    getWatch() {
      return watch;
    },
    getWatchState() {
      return watch.getState();
    },
    subscribeWatch(listener) {
      return watch.subscribe(listener);
    },
    clearWatchLog() {
      return watch.clear();
    },
    startDrawZone({ getName } = {}) {
      if (!_drawer) return { started: false, reason: 'no-drawer' };
      return _drawer.start({
        getName,
        onFinish: (ring, name) => {
          const fence = watch.addDrawnFence({ name, ring });
          if (_enabled) void layer.update();
          return fence;
        },
      });
    },
    cancelDrawZone() {
      _drawer?.cancel();
    },
    isDrawing() {
      return _drawer?.isActive() === true;
    },
    getDrawState() {
      return (
        _drawer?.getState() || {
          active: false,
          hint: '',
          vertexCount: 0,
          finishedFence: null,
        }
      );
    },
    subscribeDraw(listener) {
      return _drawer?.subscribe(listener) || (() => {});
    },
    addDrawnFence(input) {
      return watch.addDrawnFence(input);
    },
    removeFence(stableId) {
      return watch.removeFence(stableId);
    },
    removeDrawnFence(stableId) {
      return watch.removeFence(stableId);
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _lastError,
        fences: _fences.length,
      };
    },
  };
  return layer;
}
