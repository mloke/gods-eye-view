import * as Cesium from 'cesium';
import { createSdpdReportsLayer } from '../../layers/sdpd/index.js';
import * as context from '../../data/contextStore.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { overlayHost } from './overlayHost.js';

/** Wire SDPD reports to the application overlay host and selection store. */
export function createApplicationSdpdReports(options) {
  return createSdpdReportsLayer({
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
