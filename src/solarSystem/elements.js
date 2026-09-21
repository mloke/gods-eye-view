/**
 * JPL approximate Keplerian elements for 1800–2050 AD
 * (https://ssd.jpl.nasa.gov/planets/approx_pos.html, Table 1).
 * a is AU; angles are degrees; rates are per Julian century from J2000.
 *
 * Moon elements are circular local orbits (km + days), not heliocentric.
 */
export const J2000_JD = 2451545.0;

export const PLANET_ELEMENTS = Object.freeze({
  mercury: planet(0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081),
  venus: planet(0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418),
  earth: planet(1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0),
  mars: planet(1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343),
  jupiter: planet(5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106),
  saturn: planet(9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49395417, 92.59887831, -0.41897216, 113.66242448, -0.28867794),
  uranus: planet(19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.9542763, 0.40805281, 74.01692503, 0.04240589),
  neptune: planet(30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664),
  pluto: planet(39.48211675, -0.00031596, 0.2488273, 0.0000517, 17.14001206, 0.00004818, 238.92903833, 145.20780515, 224.06891629, -0.04062942, 110.30393684, -0.01183482),
});

export const MOON_ELEMENTS = Object.freeze({
  moon: moon('earth', 384400, 27.321661, 5.145, 218.316),
  phobos: moon('mars', 9376, 0.31891, 1.093, 40),
  deimos: moon('mars', 23463, 1.26244, 0.93, 80),
  io: moon('jupiter', 421800, 1.769138, 0.05, 20),
  europa: moon('jupiter', 671100, 3.551181, 0.47, 80),
  ganymede: moon('jupiter', 1070400, 7.154553, 0.2, 140),
  callisto: moon('jupiter', 1882700, 16.689018, 0.19, 200),
  mimas: moon('saturn', 185540, 0.942422, 1.53, 10),
  enceladus: moon('saturn', 238040, 1.370218, 0.02, 50),
  dione: moon('saturn', 377420, 2.736915, 0.02, 110),
  rhea: moon('saturn', 527070, 4.518212, 0.35, 160),
  titan: moon('saturn', 1221870, 15.945421, 0.35, 220),
  iapetus: moon('saturn', 3560820, 79.330183, 15.47, 280),
  miranda: moon('uranus', 129900, 1.413479, 4.34, 30),
  ariel: moon('uranus', 190900, 2.520379, 0.04, 70),
  umbriel: moon('uranus', 266000, 4.144177, 0.13, 110),
  titania: moon('uranus', 436300, 8.705872, 0.08, 150),
  oberon: moon('uranus', 583500, 13.463234, 0.07, 190),
  triton: moon('neptune', 354800, -5.876854, 156.9, 250),
  charon: moon('pluto', 19591, 6.38723, 0.08, 15),
});

function planet(a, da, e, de, i, di, L, dL, varpi, dVarpi, Omega, dOmega) {
  return Object.freeze({
    a0: a,
    da,
    e0: e,
    de,
    i0: i,
    di,
    L0: L,
    dL,
    varpi0: varpi,
    dVarpi,
    Omega0: Omega,
    dOmega,
  });
}

function moon(parentId, aKm, periodDays, inclinationDeg, meanLongitudeDeg) {
  return Object.freeze({
    parentId,
    aKm,
    periodDays,
    inclinationDeg,
    meanLongitudeDeg,
  });
}
