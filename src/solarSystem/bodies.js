/**
 * Static body catalog for the Solar System tab. Radii are mean volumetric
 * meters. Colors are fallbacks when a NASA/Solar System Scope texture cannot
 * load. Texture ids match `/api/planetary-textures/:id` (planets from Solar
 * System Scope; moons from NASA 3D Resources).
 */
export const SOLAR_BODIES = Object.freeze([
  body('sun', 'Sun', null, 695_700_000, '#ffb347', 'sun', 'star'),
  body('mercury', 'Mercury', 'sun', 2_439_700, '#9a8f7a', 'mercury', 'planet'),
  body('venus', 'Venus', 'sun', 6_051_800, '#d4b483', 'venus', 'planet'),
  body('earth', 'Earth', 'sun', 6_371_000, '#3d7dd6', 'earth', 'planet'),
  body('moon', 'Moon', 'earth', 1_737_400, '#c5c1b2', 'moon', 'moon'),
  body('mars', 'Mars', 'sun', 3_389_500, '#c1440e', 'mars', 'planet'),
  body('phobos', 'Phobos', 'mars', 11_267, '#8a7a6a', 'phobos', 'moon'),
  body('deimos', 'Deimos', 'mars', 6_200, '#7a6c5c', 'deimos', 'moon'),
  body('jupiter', 'Jupiter', 'sun', 69_911_000, '#c9a36a', 'jupiter', 'planet'),
  body('io', 'Io', 'jupiter', 1_821_600, '#d6c15a', 'io', 'moon'),
  body('europa', 'Europa', 'jupiter', 1_560_800, '#c9c4b0', 'europa', 'moon'),
  body('ganymede', 'Ganymede', 'jupiter', 2_634_100, '#9a8b72', 'ganymede', 'moon'),
  body('callisto', 'Callisto', 'jupiter', 2_410_300, '#6d6358', 'callisto', 'moon'),
  body('saturn', 'Saturn', 'sun', 58_232_000, '#e6d3a3', 'saturn', 'planet'),
  body('mimas', 'Mimas', 'saturn', 198_200, '#c8c4b8', 'mimas', 'moon'),
  body('enceladus', 'Enceladus', 'saturn', 252_100, '#e8eef2', 'enceladus', 'moon'),
  body('dione', 'Dione', 'saturn', 561_400, '#cfd0c8', 'dione', 'moon'),
  body('rhea', 'Rhea', 'saturn', 763_800, '#c8c6be', 'rhea', 'moon'),
  body('titan', 'Titan', 'saturn', 2_574_700, '#d4a35c', 'titan', 'moon'),
  body('iapetus', 'Iapetus', 'saturn', 734_500, '#8a7a68', 'iapetus', 'moon'),
  body('uranus', 'Uranus', 'sun', 25_362_000, '#7fd3e0', 'uranus', 'planet'),
  body('miranda', 'Miranda', 'uranus', 235_800, '#b8b6ae', 'miranda', 'moon'),
  body('ariel', 'Ariel', 'uranus', 578_900, '#c4c2ba', 'ariel', 'moon'),
  body('umbriel', 'Umbriel', 'uranus', 584_700, '#6a6862', 'umbriel', 'moon'),
  body('titania', 'Titania', 'uranus', 788_400, '#b0aaa0', 'titania', 'moon'),
  body('oberon', 'Oberon', 'uranus', 761_400, '#9a948c', 'oberon', 'moon'),
  body('neptune', 'Neptune', 'sun', 24_622_000, '#3f6adf', 'neptune', 'planet'),
  body('triton', 'Triton', 'neptune', 1_353_400, '#c0c4c8', 'triton', 'moon'),
  body('pluto', 'Pluto', 'sun', 1_188_300, '#c4a888', null, 'dwarf'),
  body('charon', 'Charon', 'pluto', 606_000, '#9a9088', 'charon', 'moon'),
]);

const BODIES_BY_ID = new Map(SOLAR_BODIES.map((row) => [row.id, row]));

function body(id, name, parentId, radiusM, color, textureId, kind) {
  return Object.freeze({
    id,
    name,
    parentId,
    radiusM,
    color,
    textureId,
    kind,
    visualRadiusM: radiusM,
  });
}

/** Return one catalog row or null. */
export function getSolarBody(id) {
  return BODIES_BY_ID.get(String(id || '').trim().toLowerCase()) || null;
}

/** Planets, the Sun, and Pluto — the overview pick list. */
export function listOverviewBodies() {
  return SOLAR_BODIES.filter((row) => row.kind !== 'moon');
}

/** Moons whose parent is `bodyId`. */
export function listMoonsOf(bodyId) {
  const parent = String(bodyId || '');
  return SOLAR_BODIES.filter((row) => row.parentId === parent);
}

/**
 * Parent planet/dwarf of a focused world.
 * @param {{kind?: string, id?: string, parentId?: string}|null} focused
 * @returns {string|null}
 */
export function focusedSystemParentId(focused) {
  if (!focused?.id) return null;
  return focused.kind === 'moon' ? focused.parentId : focused.id;
}

/**
 * The entered planet and its moons — globes and moon-orbits live here.
 * @param {{id: string, parentId?: string}|null} body
 * @param {{kind?: string, id?: string, parentId?: string}|null} focused
 * @returns {boolean}
 */
export function isLocalSystemBody(body, focused) {
  if (!body || !focused) return false;
  const parentId = focusedSystemParentId(focused);
  return body.id === parentId || body.parentId === parentId;
}

/**
 * What to draw. Moon focus stays local to the parent family. Planet focus
 * keeps the heliocentric map so the operator can zoom back out.
 * @param {{id: string, kind: string, parentId?: string}|null} body
 * @param {{id: string, kind: string, parentId?: string}|null} focused
 * @returns {boolean}
 */
export function isInFocusedSystem(body, focused) {
  if (!body) return false;
  if (!focused) return body.kind !== 'moon';
  if (focused.kind === 'moon') return isLocalSystemBody(body, focused);
  return body.kind !== 'moon' || body.parentId === focused.id;
}

/** Walk parent links until a heliocentric body (parent sun or none). */
export function heliocentricAncestor(id) {
  let current = getSolarBody(id);
  const seen = new Set();
  while (current?.parentId && current.parentId !== 'sun') {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    current = getSolarBody(current.parentId);
  }
  return current;
}

/** True when `id` is a known body. */
export function isSolarBodyId(id) {
  return BODIES_BY_ID.has(String(id || '').trim().toLowerCase());
}
