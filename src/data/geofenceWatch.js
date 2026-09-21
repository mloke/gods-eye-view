import { createGeofenceWatchSource } from '../layers/geofenceWatch/index.js';
import { createApplicationGeofenceWatch } from '../app/layers/geofenceWatch.js';
export * from '../layers/geofenceWatch/index.js';
/** Wire the standalone fence source, SDPD events, and application overlay owner. */
export function createGeofenceWatchLayer({
  fenceSource = createGeofenceWatchSource(),
  eventSources,
  ...options
} = {}) {
  return createApplicationGeofenceWatch({
    fenceSource,
    eventSources,
    ...options,
  });
}
export default createGeofenceWatchLayer();
