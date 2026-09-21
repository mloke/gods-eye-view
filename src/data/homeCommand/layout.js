import rawLayout from './layout.site.json' with { type: 'json' };
import { createHomeCommandInventory } from './inventory.js';

const site = createHomeCommandInventory().site;

/** CAD site layout from the HomeAlone submodule. Coordinates are meters. */
export const HOME_COMMAND_LAYOUT = Object.freeze({
  ...rawLayout,
  features: Object.freeze([...(rawLayout.features || [])]),
  site: Object.freeze({
    name: site.name,
    address: site.address,
    street: site.street,
    north_screen_deg: site.north_screen_deg,
  }),
});

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Return the CAD zone under a point, if the layout names one. */
export function zoneAt(x, y, layout = HOME_COMMAND_LAYOUT) {
  let found = null;
  for (const feature of layout.features || []) {
    const zone = feature.properties?.zone;
    const geom = feature.geometry;
    if (!zone || geom?.type !== 'Polygon') continue;
    const rings = geom.coordinates || [];
    if (!rings[0] || !ringContains(rings[0], x, y)) continue;
    let hole = false;
    for (const ring of rings.slice(1)) {
      if (ringContains(ring, x, y)) hole = true;
    }
    if (!hole) found = zone;
  }
  return found;
}
