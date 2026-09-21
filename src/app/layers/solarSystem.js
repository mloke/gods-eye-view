import { createSolarSystemLayer } from '../../layers/solarSystem/index.js';
import * as layerState from '../../data/layerState.js';

/** Construct the Solar System layer with application services. */
export function createApplicationSolarSystem() {
  return createSolarSystemLayer({
    services: { layerState },
  });
}
