import { PLANET_ELEMENTS, MOON_ELEMENTS, J2000_JD } from './elements.js';
import { visualMetersFromAu, visualMoonOrbitMeters } from './scale.js';
import { getSolarBody } from './bodies.js';

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

/**
 * Julian Date from a Unix millisecond timestamp (UTC, TT ≈ UTC for this use).
 * @param {number} epochMs
 * @returns {number}
 */
export function julianDateFromMs(epochMs) {
  return Number(epochMs) / 86_400_000 + 2_440_587.5;
}

/**
 * Julian centuries from J2000.
 * @param {number} epochMs
 * @returns {number}
 */
export function centuriesSinceJ2000(epochMs) {
  return (julianDateFromMs(epochMs) - J2000_JD) / 36525;
}

function wrapDeg(value) {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function wrapRad(value) {
  const wrapped = value % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Solve Kepler's equation E - e sin E = M for the eccentric anomaly.
 * @param {number} meanAnomalyRad
 * @param {number} eccentricity
 * @returns {number}
 */
export function solveKepler(meanAnomalyRad, eccentricity) {
  const M = wrapRad(meanAnomalyRad);
  const e = Math.min(0.98, Math.max(0, Number(eccentricity) || 0));
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 12; i++) {
    const next = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    if (Math.abs(next - E) < 1e-12) return next;
    E = next;
  }
  return E;
}

/**
 * Heliocentric ecliptic meters in the compressed scene frame.
 * @param {string} bodyId
 * @param {number} epochMs
 * @returns {{x: number, y: number, z: number, au: number, longitudeDeg: number}|null}
 */
export function heliocentricPosition(bodyId, epochMs) {
  const id = String(bodyId || '').toLowerCase();
  if (id === 'sun') return { x: 0, y: 0, z: 0, au: 0, longitudeDeg: 0 };
  const elements = PLANET_ELEMENTS[id];
  if (!elements) return null;
  const T = centuriesSinceJ2000(epochMs);
  const a = elements.a0 + elements.da * T;
  const e = elements.e0 + elements.de * T;
  const i = (elements.i0 + elements.di * T) * DEG;
  const L = wrapDeg(elements.L0 + elements.dL * T);
  const varpi = wrapDeg(elements.varpi0 + elements.dVarpi * T);
  const Omega = wrapDeg(elements.Omega0 + elements.dOmega * T) * DEG;
  const omega = (wrapDeg(varpi - wrapDeg(elements.Omega0 + elements.dOmega * T))) * DEG;
  const M = wrapDeg(L - varpi) * DEG;
  const E = solveKepler(M, e);
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E);
  const cosO = Math.cos(Omega);
  const sinO = Math.sin(Omega);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);
  const cosW = Math.cos(omega);
  const sinW = Math.sin(omega);
  const x =
    (cosO * cosW - sinO * sinW * cosI) * xOrb +
    (-cosO * sinW - sinO * cosW * cosI) * yOrb;
  const y =
    (sinO * cosW + cosO * sinW * cosI) * xOrb +
    (-sinO * sinW + cosO * cosW * cosI) * yOrb;
  const z = sinW * sinI * xOrb + cosW * sinI * yOrb;
  const au = Math.hypot(x, y, z);
  return {
    x: visualMetersFromAu(x),
    y: visualMetersFromAu(y),
    z: visualMetersFromAu(z),
    au,
    longitudeDeg: wrapDeg((Math.atan2(y, x) * 180) / Math.PI),
  };
}

/**
 * Local moon offset in compressed meters relative to its parent.
 * @param {string} moonId
 * @param {number} epochMs
 * @param {number} parentVisualRadiusM
 * @returns {{x: number, y: number, z: number}|null}
 */
export function moonOffset(moonId, epochMs, parentVisualRadiusM) {
  const elements = MOON_ELEMENTS[String(moonId || '').toLowerCase()];
  if (!elements) return null;
  const days = (julianDateFromMs(epochMs) - J2000_JD);
  const period = elements.periodDays || 1;
  const mean = wrapDeg(elements.meanLongitudeDeg + (360 * days) / period) * DEG;
  const inclination = elements.inclinationDeg * DEG;
  const radius = visualMoonOrbitMeters(elements.aKm, parentVisualRadiusM);
  return {
    x: radius * Math.cos(mean),
    y: radius * Math.sin(mean) * Math.cos(inclination),
    z: radius * Math.sin(mean) * Math.sin(inclination),
  };
}

/**
 * World position for any catalog body, including moons.
 * @param {string} bodyId
 * @param {number} epochMs
 * @returns {{x: number, y: number, z: number}|null}
 */
export function bodyWorldPosition(bodyId, epochMs) {
  const body = getSolarBody(bodyId);
  if (!body) return null;
  if (body.id === 'sun') return { x: 0, y: 0, z: 0 };
  if (body.kind === 'moon') {
    const parent = getSolarBody(body.parentId);
    const parentPos = bodyWorldPosition(body.parentId, epochMs);
    if (!parent || !parentPos) return null;
    const offset = moonOffset(body.id, epochMs, parent.visualRadiusM);
    if (!offset) return parentPos;
    return {
      x: parentPos.x + offset.x,
      y: parentPos.y + offset.y,
      z: parentPos.z + offset.z,
    };
  }
  return heliocentricPosition(body.id, epochMs);
}

/**
 * Sample a closed heliocentric orbit in the compressed frame.
 * @param {string} bodyId
 * @param {number} epochMs
 * @param {number} [samples=72]
 * @returns {{x: number, y: number, z: number}[]}
 */
export function sampleHeliocentricOrbit(bodyId, epochMs, samples = 72) {
  const elements = PLANET_ELEMENTS[String(bodyId || '').toLowerCase()];
  if (!elements) return [];
  const periodDays = 365.25 * Math.pow(elements.a0, 1.5);
  const points = [];
  for (let i = 0; i < samples; i++) {
    const t = epochMs + (i / samples) * periodDays * 86_400_000;
    const pos = heliocentricPosition(bodyId, t);
    if (pos) points.push(pos);
  }
  return points;
}
