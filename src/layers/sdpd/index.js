import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  SDPD_OVERLAY_SOURCE_ID,
  SDPD_OVERLAY_COHORT_LIMIT,
  SDPD_OVERLAY_COLLISION_CAPACITY,
  SDPD_WINDOW_DAY_OPTIONS,
  SDPD_WINDOW_DAYS,
  createSdpdOverlayEntry,
  normalizeSdpdWindowDays,
  createSdpdSelectedOverlayEntry,
  mapAnalystRecord,
  reportColor,
  selectSdpdOverlayCohort,
} from './model.js';
export * from './model.js';
export { createSdpdReportsSource } from './source.js';

const ENTITY_PREFIX = 'sdpd:';

/** Own one SDPD report display and its refresh lifecycle. */
export function createSdpdReportsLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('SDPD reports require a snapshot source');
  if (!overlayHost) throw new TypeError('SDPD reports require an overlay host');
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;
  let _selectedId = null;
  let _rows = [];
  let _clickHandler = null;
  let _windowDays = normalizeSdpdWindowDays(source.getWindowDays?.());

  function entityId(stableId) {
    return `${ENTITY_PREFIX}${stableId}`;
  }

  function publishOverlays(rows) {
    const overlayEntries = [];
    for (const row of rows) {
      const entity = _dataSource?.entities.getById(entityId(row.stableId));
      const position = entity?.position?.getValue(Cesium.JulianDate.now());
      if (!position) continue;
      const selected = row.stableId === _selectedId;
      overlayEntries.push(
        (selected ? createSdpdSelectedOverlayEntry : createSdpdOverlayEntry)({
          id: row.stableId,
          position,
          record: row,
        }),
      );
    }
    overlayHost.setEntries(
      SDPD_OVERLAY_SOURCE_ID,
      selectSdpdOverlayCohort(overlayEntries),
      {
        cohortLimit: SDPD_OVERLAY_COHORT_LIMIT,
        collisionCapacity: SDPD_OVERLAY_COLLISION_CAPACITY,
        moving: false,
      },
    );
  }

  function registerContexts(rows) {
    if (typeof context?.registerEntityContext !== 'function') return;
    context.removeEntityContextsForLayer?.(SDPD_OVERLAY_SOURCE_ID);
    for (const row of rows) {
      const entity = _dataSource?.entities.getById(entityId(row.stableId));
      if (!entity) continue;
      context.registerEntityContext(entity, {
        id: row.stableId,
        layerId: SDPD_OVERLAY_SOURCE_ID,
        layerName: 'SDPD Reports',
        source: 'San Diego Police Department',
        label: row.offense || row.category || 'SDPD report',
        latitude: row.lat,
        longitude: row.lon,
        properties: {
          offense: row.offense,
          category: row.category,
          neighborhood: row.neighborhood,
          blockAddress: row.blockAddress,
          caseNumber: row.caseNumber,
          occurredOnMs: row.occurredOnMs,
          crimeAgainst: row.crimeAgainst,
          violent: row.violent,
          property: row.property,
        },
      });
    }
  }

  function selectReport(stableId) {
    _selectedId = stableId || null;
    if (_selectedId && _enabled) publishOverlays(_rows);
    const entity = _selectedId
      ? _dataSource?.entities.getById(entityId(_selectedId))
      : null;
    if (entity) context?.selectEntityContext?.(entity);
    else context?.clearSelectedEntityContextForLayer?.(SDPD_OVERLAY_SOURCE_ID);
    if (entity && _viewer) {
      const cartesian = entity.position.getValue(Cesium.JulianDate.now());
      const carto = cartesian && Cesium.Cartographic.fromCartesian(cartesian);
      const currentHeight = _viewer.camera.positionCartographic?.height;
      if (carto && Number.isFinite(currentHeight)) {
        _viewer.scene.screenSpaceCameraController.enableInputs = false;
        _viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromRadians(
            carto.longitude,
            carto.latitude,
            currentHeight,
          ),
          duration: 1.5,
          complete: () => {
            if (_viewer)
              _viewer.scene.screenSpaceCameraController.enableInputs = true;
          },
          cancel: () => {
            if (_viewer)
              _viewer.scene.screenSpaceCameraController.enableInputs = true;
          },
        });
      }
    }
  }

  function pickedReportId(picked) {
    const entity = picked?.id;
    const id = typeof entity?.id === 'string' ? entity.id : '';
    if (id.startsWith(ENTITY_PREFIX)) return id.slice(ENTITY_PREFIX.length);
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
      const fromEntity = pickedReportId(picked);
      if (fromEntity) {
        selectReport(fromEntity);
        return;
      }
      const cardHit = overlayHost.hitTest?.(
        click.position?.x,
        click.position?.y,
        { sourceId: SDPD_OVERLAY_SOURCE_ID },
      );
      if (cardHit?.entryId) {
        selectReport(cardHit.entryId);
        return;
      }
      if (picked) return;
      selectReport(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    _clickHandler?.destroy?.();
    _clickHandler = null;
  }

  const layer = {
    id: SDPD_OVERLAY_SOURCE_ID,
    name: `SDPD Reports (${SDPD_WINDOW_DAYS}d)`,
    icon: '◆',
    source: 'SDPD NIBRS',
    updateInterval: 15 * 60_000,

    init(viewer) {
      if (_viewer) throw new Error('SDPD report layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(SDPD_OVERLAY_SOURCE_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      _selectedId = null;
      _rows = [];
      overlayHost.setVisible(SDPD_OVERLAY_SOURCE_ID, false);
    },

    enable(viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(SDPD_OVERLAY_SOURCE_ID, true);
      installClickHandler(viewer);
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _selectedId = null;
      removeClickHandler();
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(SDPD_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(SDPD_OVERLAY_SOURCE_ID, false);
      context?.clearSelectedEntityContextForLayer?.(SDPD_OVERLAY_SOURCE_ID);
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const rows = await source.getSnapshot({
          signal: request.signal,
          windowDays: _windowDays,
        });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;

        const nextEntities = [];
        for (const row of rows) {
          const color = reportColor(row);
          const isViolent = row.violent === true;
          nextEntities.push(
            new Cesium.Entity({
              id: entityId(row.stableId),
              position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
              point: {
                pixelSize: isViolent ? 10 : 8,
                color: color.withAlpha(isViolent ? 0.95 : 0.8),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              properties: {
                stableId: row.stableId,
                offense: row.offense,
                category: row.category,
                neighborhood: row.neighborhood,
                blockAddress: row.blockAddress,
                caseNumber: row.caseNumber,
                occurredOnMs: row.occurredOnMs,
                crimeAgainst: row.crimeAgainst,
                violent: row.violent,
                property: row.property,
              },
            }),
          );
        }

        _dataSource.entities.removeAll();
        for (const entity of nextEntities) _dataSource.entities.add(entity);
        _rows = rows;
        if (_selectedId && !rows.some((row) => row.stableId === _selectedId))
          _selectedId = null;
        if (_enabled) {
          publishOverlays(rows);
          registerContexts(rows);
          if (_selectedId) {
            const selected = _dataSource.entities.getById(
              entityId(_selectedId),
            );
            if (selected) context?.selectEntityContext?.(selected);
          }
        }

        _count = rows.length;
        _lastUpdate = Date.now();
        _lastError = null;
        return true;
      } catch (e) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:SDPD] Fetch error:', e);
        _lastError = e?.message || 'SDPD source unavailable';
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
      overlayHost.clearSource(SDPD_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(SDPD_OVERLAY_SOURCE_ID, false);
      context?.clearSelectedEntityContextForLayer?.(SDPD_OVERLAY_SOURCE_ID);
      if (_dataSource) {
        viewer?.dataSources?.remove(_dataSource, true);
        _dataSource = null;
      }
      _viewer = null;
      _rows = [];
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
    },

    getDetectableObjects(options = {}) {
      if (!_enabled || !_dataSource) return [];
      const maxCount = Number.isFinite(options.maxCount)
        ? Math.max(1, Math.floor(options.maxCount))
        : 250;
      const now = Cesium.JulianDate.now();
      const result = [];
      for (const entity of _dataSource.entities.values) {
        const cartesian = entity.position?.getValue(now);
        if (!cartesian) continue;
        result.push({
          position: cartesian,
          id: String(entity.id).slice(ENTITY_PREFIX.length),
          type: 'SDPD',
        });
        if (result.length >= maxCount) break;
      }
      return result;
    },

    setParams(params = {}) {
      if (!Object.hasOwn(params, 'windowDays')) return true;
      const next = normalizeSdpdWindowDays(params.windowDays);
      if (next === _windowDays) return true;
      _windowDays = next;
      source.setWindowDays?.(next);
      layer.name = `SDPD Reports (${next}d)`;
      if (_enabled) void layer.update();
      return true;
    },

    getParams() {
      return { windowDays: _windowDays };
    },

    getRowControls() {
      return {
        chips: SDPD_WINDOW_DAY_OPTIONS.map((days) => ({
          id: `window-${days}`,
          label: `${days}D`,
          title: `Show reports from the last ${days} days`,
          active: _windowDays === days,
          params: { windowDays: days },
        })),
      };
    },

    getAnalystRecords(maxCount = 2000) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return _rows.slice(0, limit).map((row, index) =>
        mapAnalystRecord(
          {
            id: row.stableId,
            offense: row.offense,
            category: row.category,
            neighborhood: row.neighborhood,
            blockAddress: row.blockAddress,
            crimeAgainst: row.crimeAgainst,
            lat: row.lat,
            lon: row.lon,
            occurredOnMs: row.occurredOnMs,
            violent: row.violent,
            property: row.property,
          },
          index,
        ),
      );
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    },
  };
  return layer;
}
