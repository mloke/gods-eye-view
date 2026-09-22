import { createWeatherSource } from '../layers/weather/index.js';
import { createApplicationWeather } from '../app/layers/weather.js';
export * from '../layers/weather/index.js';

/** Wire the standalone source and application overlay owner. */
export function createWeatherLayer({
  source = createWeatherSource(),
  ...options
} = {}) {
  return createApplicationWeather({ source, ...options });
}
export default createWeatherLayer();
