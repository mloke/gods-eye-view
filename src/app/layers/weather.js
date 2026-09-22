import * as Cesium from 'cesium';
import { createWeatherLayer } from '../../layers/weather/index.js';
import * as context from '../../data/contextStore.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { overlayHost } from './overlayHost.js';

/** Wire Earth-view weather to the application overlay host and selection store. */
export function createApplicationWeather(options) {
  return createWeatherLayer({
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
