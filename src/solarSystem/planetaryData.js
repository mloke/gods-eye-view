import { getSolarBody, SOLAR_BODIES } from './bodies.js';

/**
 * Bundled NASA Planetary Fact Sheet values for the Solar System tab.
 * These are static reference numbers, not live Horizons ephemerides.
 */
export const PLANETARY_DATA = Object.freeze(
  Object.fromEntries(
    [
      facts('sun', {
        summary: 'G-type star at the barycenter of the system.',
        massEarths: 332_946,
        gravityMps2: 274,
        densityKgm3: 1408,
        siderealRotationHours: 609.12,
        meanTempC: 5500,
        atmosphere: 'Photosphere — hydrogen / helium',
        moonsKnown: 0,
        escapeVelocityKms: 617.6,
      }),
      facts('mercury', {
        summary: 'Innermost rocky planet with almost no atmosphere.',
        massEarths: 0.0553,
        gravityMps2: 3.7,
        densityKgm3: 5427,
        siderealRotationHours: 1407.6,
        orbitalPeriodDays: 87.97,
        solarDistanceAu: 0.387,
        meanTempC: 167,
        atmosphere: 'Negligible',
        moonsKnown: 0,
        axialTiltDeg: 0.03,
        escapeVelocityKms: 4.3,
      }),
      facts('venus', {
        summary: 'Clouded greenhouse world rotating retrograde.',
        massEarths: 0.815,
        gravityMps2: 8.87,
        densityKgm3: 5243,
        siderealRotationHours: -5832.5,
        orbitalPeriodDays: 224.7,
        solarDistanceAu: 0.723,
        meanTempC: 464,
        atmosphere: 'CO₂ with sulfuric-acid clouds',
        moonsKnown: 0,
        axialTiltDeg: 177.4,
        escapeVelocityKms: 10.36,
      }),
      facts('earth', {
        summary: 'Only known inhabited world; one large moon.',
        massEarths: 1,
        gravityMps2: 9.8,
        densityKgm3: 5514,
        siderealRotationHours: 23.93,
        orbitalPeriodDays: 365.26,
        solarDistanceAu: 1,
        meanTempC: 15,
        atmosphere: 'N₂ / O₂',
        moonsKnown: 1,
        axialTiltDeg: 23.44,
        escapeVelocityKms: 11.19,
      }),
      facts('moon', {
        summary: 'Tidally locked companion of Earth.',
        massEarths: 0.0123,
        gravityMps2: 1.62,
        densityKgm3: 3344,
        siderealRotationHours: 655.7,
        orbitalPeriodDays: 27.32,
        parentDistanceKm: 384_400,
        meanTempC: -20,
        atmosphere: 'None',
        moonsKnown: 0,
        axialTiltDeg: 6.68,
        escapeVelocityKms: 2.38,
      }),
      facts('mars', {
        summary: 'Cold desert planet with polar ice and two small moons.',
        massEarths: 0.107,
        gravityMps2: 3.71,
        densityKgm3: 3934,
        siderealRotationHours: 24.62,
        orbitalPeriodDays: 686.98,
        solarDistanceAu: 1.524,
        meanTempC: -63,
        atmosphere: 'Thin CO₂',
        moonsKnown: 2,
        axialTiltDeg: 25.19,
        escapeVelocityKms: 5.03,
      }),
      facts('phobos', {
        summary: 'Inner irregular moon of Mars, spiraling inward.',
        massEarths: 1.8e-9,
        gravityMps2: 0.0057,
        densityKgm3: 1876,
        siderealRotationHours: 7.65,
        orbitalPeriodDays: 0.319,
        parentDistanceKm: 9376,
        meanTempC: -4,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.011,
      }),
      facts('deimos', {
        summary: 'Outer irregular moon of Mars.',
        massEarths: 2.5e-10,
        gravityMps2: 0.003,
        densityKgm3: 1471,
        siderealRotationHours: 30.3,
        orbitalPeriodDays: 1.263,
        parentDistanceKm: 23_463,
        meanTempC: -40,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.006,
      }),
      facts('jupiter', {
        summary: 'Gas giant with a strong magnetosphere and many moons.',
        massEarths: 317.8,
        gravityMps2: 24.79,
        densityKgm3: 1326,
        siderealRotationHours: 9.93,
        orbitalPeriodDays: 4332.6,
        solarDistanceAu: 5.203,
        meanTempC: -110,
        atmosphere: 'H₂ / He',
        moonsKnown: 95,
        axialTiltDeg: 3.13,
        escapeVelocityKms: 59.5,
      }),
      facts('io', {
        summary: 'Most volcanically active body in the Solar System.',
        massEarths: 0.015,
        gravityMps2: 1.8,
        densityKgm3: 3528,
        siderealRotationHours: 42.5,
        orbitalPeriodDays: 1.769,
        parentDistanceKm: 421_800,
        meanTempC: -130,
        atmosphere: 'Patchy SO₂',
        moonsKnown: 0,
        escapeVelocityKms: 2.56,
      }),
      facts('europa', {
        summary: 'Icy moon with a likely subsurface ocean.',
        massEarths: 0.008,
        gravityMps2: 1.31,
        densityKgm3: 3013,
        siderealRotationHours: 85.2,
        orbitalPeriodDays: 3.551,
        parentDistanceKm: 671_100,
        meanTempC: -160,
        atmosphere: 'Trace O₂',
        moonsKnown: 0,
        escapeVelocityKms: 2.03,
      }),
      facts('ganymede', {
        summary: 'Largest moon in the Solar System; has its own magnetosphere.',
        massEarths: 0.025,
        gravityMps2: 1.43,
        densityKgm3: 1942,
        siderealRotationHours: 171.7,
        orbitalPeriodDays: 7.155,
        parentDistanceKm: 1_070_400,
        meanTempC: -160,
        atmosphere: 'Trace O₂',
        moonsKnown: 0,
        escapeVelocityKms: 2.74,
      }),
      facts('callisto', {
        summary: 'Heavily cratered outer Galilean moon.',
        massEarths: 0.018,
        gravityMps2: 1.24,
        densityKgm3: 1834,
        siderealRotationHours: 400.5,
        orbitalPeriodDays: 16.69,
        parentDistanceKm: 1_882_700,
        meanTempC: -140,
        atmosphere: 'Trace CO₂',
        moonsKnown: 0,
        escapeVelocityKms: 2.44,
      }),
      facts('saturn', {
        summary: 'Ringed gas giant with a low mean density.',
        massEarths: 95.2,
        gravityMps2: 10.44,
        densityKgm3: 687,
        siderealRotationHours: 10.7,
        orbitalPeriodDays: 10_759,
        solarDistanceAu: 9.537,
        meanTempC: -140,
        atmosphere: 'H₂ / He',
        moonsKnown: 146,
        axialTiltDeg: 26.73,
        escapeVelocityKms: 35.5,
      }),
      facts('mimas', {
        summary: 'Small inner moon of Saturn; Herschel crater is huge relative to the body.',
        massEarths: 6.3e-6,
        gravityMps2: 0.064,
        densityKgm3: 1152,
        siderealRotationHours: 22.6,
        orbitalPeriodDays: 0.942,
        parentDistanceKm: 185_539,
        meanTempC: -200,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.16,
      }),
      facts('enceladus', {
        summary: 'Icy moon with south-polar water plumes.',
        massEarths: 1.8e-5,
        gravityMps2: 0.113,
        densityKgm3: 1609,
        siderealRotationHours: 32.9,
        orbitalPeriodDays: 1.37,
        parentDistanceKm: 237_948,
        meanTempC: -198,
        atmosphere: 'Local water vapor',
        moonsKnown: 0,
        escapeVelocityKms: 0.24,
      }),
      facts('dione', {
        summary: 'Icy mid-sized moon of Saturn.',
        massEarths: 1.8e-4,
        gravityMps2: 0.232,
        densityKgm3: 1478,
        siderealRotationHours: 65.7,
        orbitalPeriodDays: 2.737,
        parentDistanceKm: 377_396,
        meanTempC: -186,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.51,
      }),
      facts('rhea', {
        summary: 'Second-largest moon of Saturn.',
        massEarths: 3.9e-4,
        gravityMps2: 0.264,
        densityKgm3: 1236,
        siderealRotationHours: 108.4,
        orbitalPeriodDays: 4.518,
        parentDistanceKm: 527_108,
        meanTempC: -174,
        atmosphere: 'Trace O₂ / CO₂',
        moonsKnown: 0,
        escapeVelocityKms: 0.64,
      }),
      facts('titan', {
        summary: 'Only moon with a dense atmosphere and stable surface liquids.',
        massEarths: 0.0225,
        gravityMps2: 1.35,
        densityKgm3: 1880,
        siderealRotationHours: 382.7,
        orbitalPeriodDays: 15.95,
        parentDistanceKm: 1_221_870,
        meanTempC: -179,
        atmosphere: 'Dense N₂ with methane',
        moonsKnown: 0,
        escapeVelocityKms: 2.64,
      }),
      facts('iapetus', {
        summary: 'Two-toned outer moon of Saturn.',
        massEarths: 3.0e-4,
        gravityMps2: 0.223,
        densityKgm3: 1088,
        siderealRotationHours: 1904,
        orbitalPeriodDays: 79.32,
        parentDistanceKm: 3_560_820,
        meanTempC: -143,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.57,
      }),
      facts('uranus', {
        summary: 'Ice giant lying on its side, with a methane-tinted atmosphere.',
        massEarths: 14.5,
        gravityMps2: 8.69,
        densityKgm3: 1271,
        siderealRotationHours: -17.24,
        orbitalPeriodDays: 30_687,
        solarDistanceAu: 19.19,
        meanTempC: -195,
        atmosphere: 'H₂ / He / CH₄',
        moonsKnown: 28,
        axialTiltDeg: 97.77,
        escapeVelocityKms: 21.3,
      }),
      facts('miranda', {
        summary: 'Innermost major moon of Uranus; extreme cliff terrain.',
        massEarths: 1.1e-5,
        gravityMps2: 0.079,
        densityKgm3: 1202,
        siderealRotationHours: 33.9,
        orbitalPeriodDays: 1.413,
        parentDistanceKm: 129_390,
        meanTempC: -187,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.19,
      }),
      facts('ariel', {
        summary: 'Bright mid-sized moon of Uranus.',
        massEarths: 2.1e-4,
        gravityMps2: 0.249,
        densityKgm3: 1592,
        siderealRotationHours: 60.5,
        orbitalPeriodDays: 2.52,
        parentDistanceKm: 191_020,
        meanTempC: -213,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.56,
      }),
      facts('umbriel', {
        summary: 'Dark mid-sized moon of Uranus.',
        massEarths: 2.1e-4,
        gravityMps2: 0.23,
        densityKgm3: 1639,
        siderealRotationHours: 99.5,
        orbitalPeriodDays: 4.144,
        parentDistanceKm: 266_000,
        meanTempC: -198,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.52,
      }),
      facts('titania', {
        summary: 'Largest moon of Uranus.',
        massEarths: 5.7e-4,
        gravityMps2: 0.367,
        densityKgm3: 1715,
        siderealRotationHours: 208.9,
        orbitalPeriodDays: 8.706,
        parentDistanceKm: 435_910,
        meanTempC: -203,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.77,
      }),
      facts('oberon', {
        summary: 'Outermost major moon of Uranus.',
        massEarths: 5.2e-4,
        gravityMps2: 0.354,
        densityKgm3: 1630,
        siderealRotationHours: 323.1,
        orbitalPeriodDays: 13.46,
        parentDistanceKm: 583_520,
        meanTempC: -203,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.73,
      }),
      facts('neptune', {
        summary: 'Farthest ice giant; Triton orbits retrograde.',
        massEarths: 17.1,
        gravityMps2: 11.15,
        densityKgm3: 1638,
        siderealRotationHours: 16.11,
        orbitalPeriodDays: 60_190,
        solarDistanceAu: 30.07,
        meanTempC: -200,
        atmosphere: 'H₂ / He / CH₄',
        moonsKnown: 16,
        axialTiltDeg: 28.32,
        escapeVelocityKms: 23.5,
      }),
      facts('triton', {
        summary: 'Retrograde captured moon with nitrogen geysers.',
        massEarths: 0.0036,
        gravityMps2: 0.78,
        densityKgm3: 2065,
        siderealRotationHours: -141.0,
        orbitalPeriodDays: -5.877,
        parentDistanceKm: 354_759,
        meanTempC: -235,
        atmosphere: 'Thin N₂',
        moonsKnown: 0,
        escapeVelocityKms: 1.46,
      }),
      facts('pluto', {
        summary: 'Icy dwarf planet in a binary with Charon.',
        massEarths: 0.0022,
        gravityMps2: 0.62,
        densityKgm3: 1854,
        siderealRotationHours: -153.3,
        orbitalPeriodDays: 90_560,
        solarDistanceAu: 39.48,
        meanTempC: -229,
        atmosphere: 'Seasonal N₂',
        moonsKnown: 5,
        axialTiltDeg: 122.5,
        escapeVelocityKms: 1.21,
      }),
      facts('charon', {
        summary: 'Large companion of Pluto; the pair is tidally locked.',
        massEarths: 2.7e-4,
        gravityMps2: 0.29,
        densityKgm3: 1702,
        siderealRotationHours: 153.3,
        orbitalPeriodDays: 6.387,
        parentDistanceKm: 19_591,
        meanTempC: -220,
        atmosphere: 'None',
        moonsKnown: 0,
        escapeVelocityKms: 0.59,
      }),
    ].map((row) => [row.id, row]),
  ),
);

function facts(id, fields) {
  return Object.freeze({
    id,
    source: 'NASA Planetary Fact Sheet',
    ...fields,
  });
}

/** Raw fact row for a catalog body, or null. */
export function getPlanetaryData(id) {
  return PLANETARY_DATA[String(id || '').trim().toLowerCase()] || null;
}

function formatMass(massEarths) {
  if (!(massEarths > 0)) return null;
  if (massEarths >= 1000) return `${massEarths.toLocaleString('en-US')} Earth`;
  if (massEarths >= 0.01) return `${trimNumber(massEarths, 3)} Earth`;
  return `${massEarths.toExponential(1)} Earth`;
}

function formatHours(hours) {
  if (!Number.isFinite(hours) || hours === 0) return null;
  const abs = Math.abs(hours);
  const suffix = hours < 0 ? ' (retrograde)' : '';
  if (abs >= 48) return `${trimNumber(abs / 24, 2)} d${suffix}`;
  return `${trimNumber(abs, 2)} h${suffix}`;
}

function formatDays(days) {
  if (!Number.isFinite(days) || days === 0) return null;
  const abs = Math.abs(days);
  const suffix = days < 0 ? ' (retrograde)' : '';
  if (abs >= 400) return `${trimNumber(abs / 365.25, 2)} yr${suffix}`;
  return `${trimNumber(abs, 2)} d${suffix}`;
}

function formatTemp(tempC) {
  if (!Number.isFinite(tempC)) return null;
  return `${tempC > 0 ? '+' : ''}${Math.round(tempC)}°C`;
}

function trimNumber(value, digits) {
  return String(Number(value.toFixed(digits)));
}

/**
 * Panel / voice-ready fact sheet for one body.
 * @param {string} id
 * @returns {{id: string, name: string, summary: string, blurb: string, rows: {label: string, value: string}[]}|null}
 */
export function formatPlanetaryData(id) {
  const body = getSolarBody(id);
  const data = getPlanetaryData(id);
  if (!body || !data) return null;
  const parent = body.parentId ? getSolarBody(body.parentId) : null;
  const rows = [];
  const radiusKm = Math.round(body.radiusM / 1000);
  rows.push({
    label: 'Radius',
    value:
      radiusKm >= 1000
        ? `${(radiusKm / 1000).toFixed(radiusKm >= 10_000 ? 0 : 2)} thousand km`
        : `${radiusKm.toLocaleString('en-US')} km`,
  });
  const mass = formatMass(data.massEarths);
  if (mass) rows.push({ label: 'Mass', value: mass });
  if (Number.isFinite(data.gravityMps2))
    rows.push({
      label: 'Gravity',
      value: `${trimNumber(data.gravityMps2, 2)} m/s²`,
    });
  const day = formatHours(data.siderealRotationHours);
  if (day) rows.push({ label: 'Day', value: day });
  const year = formatDays(data.orbitalPeriodDays);
  if (year) rows.push({ label: body.kind === 'moon' ? 'Orbit' : 'Year', value: year });
  if (Number.isFinite(data.solarDistanceAu))
    rows.push({ label: 'Distance', value: `${trimNumber(data.solarDistanceAu, 3)} AU` });
  if (Number.isFinite(data.parentDistanceKm) && parent)
    rows.push({
      label: parent.name,
      value: `${Math.round(data.parentDistanceKm).toLocaleString('en-US')} km`,
    });
  const temp = formatTemp(data.meanTempC);
  if (temp) rows.push({ label: 'Mean T', value: temp });
  if (data.atmosphere) rows.push({ label: 'Air', value: data.atmosphere });
  if (Number.isFinite(data.moonsKnown) && data.moonsKnown > 0)
    rows.push({ label: 'Moons', value: String(data.moonsKnown) });
  if (Number.isFinite(data.axialTiltDeg))
    rows.push({ label: 'Tilt', value: `${trimNumber(data.axialTiltDeg, 1)}°` });
  const blurb = [
    Number.isFinite(data.solarDistanceAu)
      ? `${trimNumber(data.solarDistanceAu, 2)} AU`
      : parent
        ? `moon of ${parent.name}`
        : body.kind,
    year,
    temp,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: body.id,
    name: body.name,
    kind: body.kind,
    summary: data.summary,
    blurb,
    source: data.source,
    rows,
  };
}

/** Every catalog body must have a fact row. */
export function validatePlanetaryData(bodies = SOLAR_BODIES) {
  return bodies
    .map((body) => body.id)
    .filter((id) => !getPlanetaryData(id));
}
