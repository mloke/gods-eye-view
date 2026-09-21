/** Compressed heliocentric meters per astronomical unit. */
export const VISUAL_AU_M = 40_000_000;
/** True meters in one AU. */
export const TRUE_AU_M = 149_597_870_700;
/** Overview camera distance that frames Neptune. */
export const SYSTEM_OVERVIEW_RANGE_M = 1_850_000_000;
/**
 * Cesium `lookAtTransform` converts heading/pitch via
 * `offsetFromHeadingPitchRange`: pitch −π/2 places the camera on +Z,
 * looking down onto the ecliptic XY plane.
 */
export const SYSTEM_OVERVIEW_HEADING = 0;
export const SYSTEM_OVERVIEW_PITCH = -Math.PI / 2;
/** Sidereal day used when a body has no published rotation period. */
export const DEFAULT_SIDEREAL_DAY_S = 86400;

/**
 * Convert a true heliocentric distance in AU into the compressed scene frame.
 * @param {number} au
 * @returns {number}
 */
export function visualMetersFromAu(au) {
  return Number(au) * VISUAL_AU_M;
}

/**
 * Convert a true kilometer offset (moon/orbiter) into a readable local radius
 * around an already-exaggerated parent body.
 * @param {number} trueKm
 * @param {number} parentVisualRadiusM
 * @returns {number}
 */
export function visualMoonOrbitMeters(trueKm, parentVisualRadiusM) {
  const trueM = Number(trueKm) * 1000;
  if (!(trueM > 0) || !(parentVisualRadiusM > 0)) return parentVisualRadiusM * 2;
  const compressed = (trueM / TRUE_AU_M) * VISUAL_AU_M;
  const floor = parentVisualRadiusM * 1.65;
  const ceiling = parentVisualRadiusM * 9;
  return Math.min(ceiling, Math.max(floor, compressed * 180));
}

/**
 * Exaggerated pickable radius for a body whose true radius is in meters.
 * Small moons stay clickable; Jupiter stays larger than Earth without eating
 * the inner system.
 * @param {number} trueRadiusM
 * @returns {number}
 */
export function visualBodyRadiusM(trueRadiusM) {
  const radius = Number(trueRadiusM);
  if (!(radius > 0)) return 220_000;
  const decades = Math.log10(radius);
  return 160_000 + 210_000 * Math.max(0, decades - 3.2);
}

/**
 * Camera range used after entering a body.
 * @param {number} visualRadiusM
 * @returns {number}
 */
export function enteredBodyRangeM(visualRadiusM) {
  return Math.max(900_000, Number(visualRadiusM) * 3.6);
}
