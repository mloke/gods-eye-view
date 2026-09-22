import { getPlanetaryData } from './planetaryData.js';

/**
 * Ecliptic attitude for a catalog body.
 * Local +Z is the north pole; +X tilt matches the NASA fact-sheet obliquity.
 * Cesium's default ENU-at-WGS84 orientation is wrong in the heliocentric frame
 * (it aims every pole radially away from the Sun).
 */
export function bodyAttitude(bodyId, epochMs = Date.now()) {
  const data = getPlanetaryData(bodyId);
  const tiltDeg = Number(data?.axialTiltDeg);
  const hours = Number(data?.siderealRotationHours);
  const tiltRad = Number.isFinite(tiltDeg) ? (tiltDeg * Math.PI) / 180 : 0;
  let spinRad = 0;
  if (Number.isFinite(hours) && hours !== 0) {
    const periodMs = Math.abs(hours) * 3_600_000;
    const sign = hours < 0 ? -1 : 1;
    spinRad = sign * (((Number(epochMs) / periodMs) % 1) * Math.PI * 2);
  }
  return { tiltRad, spinRad };
}

function quatAxisAngle(ax, ay, az, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
}

function quatMultiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** Spin around the pole, then apply axial tilt around +X. */
export function composeTiltSpin(tiltRad, spinRad) {
  const qSpin = quatAxisAngle(0, 0, 1, spinRad);
  const qTilt = quatAxisAngle(1, 0, 0, tiltRad);
  return quatMultiply(qTilt, qSpin);
}

/** Quaternion from body-local axes into the heliocentric ecliptic frame. */
export function bodyOrientationComponents(bodyId, epochMs = Date.now()) {
  const { tiltRad, spinRad } = bodyAttitude(bodyId, epochMs);
  return composeTiltSpin(tiltRad, spinRad);
}

/** Equatorial ring sample after the same +X tilt used for the globe. */
export function equatorialRingOffset(radiusM, theta, tiltRad) {
  const x = Math.cos(theta) * radiusM;
  const y = Math.sin(theta) * radiusM;
  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);
  return {
    x,
    y: y * cosT,
    z: y * sinT,
  };
}
