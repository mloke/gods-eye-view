import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import {
  LOCATION_TAGS_OVERLAY_SOURCE_ID,
  LOCATION_TAGS_OVERLAY_COHORT_LIMIT,
  LOCATION_TAGS_OVERLAY_COLLISION_CAPACITY,
  createLocationTagOverlayEntry,
  createLocationTagSelectedOverlayEntry,
  mapAnalystRecord,
  placeColor,
  selectLocationTagOverlayCohort,
} from './model.js';
export * from './model.js';
export { createLocationTagsSource } from './source.js';

const ENTITY_PREFIX = 'tag:';

/** Own one personal-tags display and its refresh lifecycle. */
export function createLocationTagsLayer({
  source,
  overlayHost,
  context,
  screenSpaceEventHandlerFactory,
} = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Location tags require a snapshot source');
  if (!overlayHost)
    throw new TypeError('Location tags require an overlay host');
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
        (selected
          ? createLocationTagSelectedOverlayEntry
          : createLocationTagOverlayEntry)({
          id: row.stableId,
          position,
          record: row,
        }),
      );
    }
    overlayHost.setEntries(
      LOCATION_TAGS_OVERLAY_SOURCE_ID,
      selectLocationTagOverlayCohort(overlayEntries),
      {
        cohortLimit: LOCATION_TAGS_OVERLAY_COHORT_LIMIT,
        collisionCapacity: LOCATION_TAGS_OVERLAY_COLLISION_CAPACITY,
        moving: false,
      },
    );
  }

  function registerContexts(rows) {
    if (typeof context?.registerEntityContext !== 'function') return;
    context.removeEntityContextsForLayer?.(LOCATION_TAGS_OVERLAY_SOURCE_ID);
    for (const row of rows) {
      const entity = _dataSource?.entities.getById(entityId(row.stableId));
      if (!entity) continue;
      context.registerEntityContext(entity, {
        id: row.stableId,
        layerId: LOCATION_TAGS_OVERLAY_SOURCE_ID,
        layerName: 'Personal Tags',
        source: 'config/location-tags.json',
        label: row.name,
        latitude: row.lat,
        longitude: row.lon,
        properties: {
          name: row.name,
          tags: row.tags,
          note: row.note,
        },
      });
    }
  }

  function selectPlace(stableId) {
    _selectedId = stableId || null;
    if (_enabled) publishOverlays(_rows);
    const entity = _selectedId
      ? _dataSource?.entities.getById(entityId(_selectedId))
      : null;
    if (entity) context?.selectEntityContext?.(entity);
    else
      context?.clearSelectedEntityContextForLayer?.(
        LOCATION_TAGS_OVERLAY_SOURCE_ID,
      );
  }

  function pickedPlaceId(picked) {
    const id = typeof picked?.id?.id === 'string' ? picked.id.id : '';
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
      const fromEntity = pickedPlaceId(picked);
      if (fromEntity) {
        selectPlace(fromEntity);
        return;
      }
      const cardHit = overlayHost.hitTest?.(
        click.position?.x,
        click.position?.y,
        { sourceId: LOCATION_TAGS_OVERLAY_SOURCE_ID },
      );
      if (cardHit?.entryId) {
        selectPlace(cardHit.entryId);
        return;
      }
      if (picked) return;
      selectPlace(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function removeClickHandler() {
    _clickHandler?.destroy?.();
    _clickHandler = null;
  }

  const layer = {
    id: LOCATION_TAGS_OVERLAY_SOURCE_ID,
    name: 'Personal Tags',
    icon: '◈',
    source: 'config/location-tags.json',
    updateInterval: 0,

    init(viewer) {
      if (_viewer)
        throw new Error('Location tags layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(
        LOCATION_TAGS_OVERLAY_SOURCE_ID,
      );
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      _selectedId = null;
      _rows = [];
      overlayHost.setVisible(LOCATION_TAGS_OVERLAY_SOURCE_ID, false);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost.setVisible(LOCATION_TAGS_OVERLAY_SOURCE_ID, true);
      installClickHandler();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _selectedId = null;
      removeClickHandler();
      if (_dataSource) _dataSource.show = false;
      overlayHost.clearSource(LOCATION_TAGS_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(LOCATION_TAGS_OVERLAY_SOURCE_ID, false);
      context?.clearSelectedEntityContextForLayer?.(
        LOCATION_TAGS_OVERLAY_SOURCE_ID,
      );
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const rows = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;

        const nextEntities = [];
        for (const row of rows) {
          const color = placeColor(row);
          nextEntities.push(
            new Cesium.Entity({
              id: entityId(row.stableId),
              position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
              point: {
                pixelSize: 11,
                color: color.withAlpha(0.95),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              properties: {
                stableId: row.stableId,
                name: row.name,
                tags: row.tags,
                note: row.note,
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
        console.warn('[Data:LocationTags] Load error:', e);
        _lastError = e?.message || 'Location tags file unavailable';
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
      overlayHost.clearSource(LOCATION_TAGS_OVERLAY_SOURCE_ID);
      overlayHost.setVisible(LOCATION_TAGS_OVERLAY_SOURCE_ID, false);
      context?.clearSelectedEntityContextForLayer?.(
        LOCATION_TAGS_OVERLAY_SOURCE_ID,
      );
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

    getAnalystRecords(maxCount = 2000) {
      if (!_dataSource || !_dataSource.show) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return _rows.slice(0, limit).map((row, index) =>
        mapAnalystRecord(
          {
            id: row.stableId,
            name: row.name,
            tags: row.tags,
            note: row.note,
            lat: row.lat,
            lon: row.lon,
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
