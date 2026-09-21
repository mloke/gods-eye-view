import { createSdpdReportsSource } from '../layers/sdpd/index.js';
import { createApplicationSdpdReports } from '../app/layers/sdpdReports.js';
export * from '../layers/sdpd/index.js';
/** Wire the standalone source and application overlay owner. */
export function createSdpdReportsLayer({
  source = createSdpdReportsSource(),
  ...options
} = {}) {
  return createApplicationSdpdReports({ source, ...options });
}
export default createSdpdReportsLayer();
