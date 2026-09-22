/** True meters in one AU — the scene uses this scale with no compression. */
export const TRUE_AU_M = 149_597_870_700;
/** Scene meters per astronomical unit. Same as true AU. */
export const VISUAL_AU_M = TRUE_AU_M;
/** Overview camera distance that frames Pluto from the Sun. */
export const SYSTEM_OVERVIEW_RANGE_M = 46 * TRUE_AU_M;
/** Closest solar-system zoom (small moons). */
export const SOLAR_CAMERA_MIN_ZOOM_M = 100;
/** Far enough to keep Voyager in the true-scale frustum. */
export const SOLAR_CAMERA_FAR_M = 200 * TRUE_AU_M;
export const SOLAR_CAMERA_MAX_ZOOM_M = SOLAR_CAMERA_FAR_M;
export const SOLAR_CAMERA_NEAR_M = 100;
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
 * Convert a heliocentric distance in AU into scene meters.
 * @param {number} au
 * @returns {number}
 */
export function visualMetersFromAu(au) {
  return Number(au) * VISUAL_AU_M;
}

/**
 * Moon-orbit radius in scene meters — true kilometers.
 * @param {number} trueKm
 * @param {number} parentRadiusM
 * @returns {number}
 */
export function visualMoonOrbitMeters(trueKm, parentRadiusM) {
  const trueM = Number(trueKm) * 1000;
  const parent = Number(parentRadiusM);
  if (!(trueM > 0)) return Math.max(parent, 0) * 2;
  return Math.max(trueM, parent * 1.15);
}

/**
 * Body radius in scene meters. Everything is true scale.
 * @param {number} trueRadiusM
 * @returns {number}
 */
export function visualBodyRadiusM(trueRadiusM) {
  const radius = Number(trueRadiusM);
  return radius > 0 ? radius : 220_000;
}

/**
 * On-screen globe radius. Every body, including the Sun, uses true meters.
 * @param {{visualRadiusM?: number, radiusM?: number}|null} body
 * @returns {number}
 */
export function displayBodyRadiusM(body) {
  return Number(body?.visualRadiusM || body?.radiusM) || 220_000;
}

/**
 * Camera range used after entering a body.
 * @param {{radiusM?: number, visualRadiusM?: number}|number} bodyOrRadius
 * @returns {number}
 */
export function enteredBodyRangeM(bodyOrRadius) {
  const radius =
    bodyOrRadius && typeof bodyOrRadius === 'object'
      ? Number(bodyOrRadius.visualRadiusM || bodyOrRadius.radiusM)
      : Number(bodyOrRadius);
  return Math.max(radius * 3.8, 28_000);
}

/**
 * Body-relative orbiter altitude in scene meters — true kilometers.
 * @param {number} altitudeKm
 * @returns {number}
 */
export function visualOrbiterAltitudeM(altitudeKm) {
  return Math.max(0, Number(altitudeKm) || 0) * 1000;
}
