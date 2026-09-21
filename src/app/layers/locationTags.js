import * as Cesium from 'cesium';
import { createLocationTagsLayer } from '../../layers/locationTags/index.js';
import * as context from '../../data/contextStore.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { overlayHost } from './overlayHost.js';

/** Wire personal location tags to the application overlay host. */
export function createApplicationLocationTags(options) {
  return createLocationTagsLayer({
    overlayHost: {
      ...overlayHost,
      hitTest: overlays.hitTestWorldOverlay,
    },
    context,
    screenSpaceEventHandlerFactory:
      options?.screenSpaceEventHandlerFactory ??
      ((viewer) => new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)),
    ...options,
  });
}
