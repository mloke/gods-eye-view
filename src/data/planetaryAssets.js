import { getSolarBody, SOLAR_BODIES } from '../solarSystem/bodies.js';
import { bodyWorldPosition } from '../solarSystem/ephemeris.js';
import { visualMetersFromAu } from '../solarSystem/scale.js';

const SURFACE_KINDS = new Set(['rover', 'lander']);
const ORBIT_KINDS = new Set(['orbiter', 'probe']);

/**
 * Last-known solar-system spacecraft. Positions are dated public stand-ins,
 * not live telemetry. Earth entries are science / weather craft only — the
 * live CelesTrak layer still owns the thousands of Earth commsats.
 */
export const PLANETARY_ASSETS = Object.freeze([
  // Heliocentric / interstellar — drawn on the system overview.
  probe('parker-solar-probe', 'Parker Solar Probe', 'sun', 2026, 0.45, 78, 3.4, 'Closest solar perihelia; last published cruise'),
  probe('solar-orbiter', 'Solar Orbiter', 'sun', 2026, 0.7, 150, 17, 'ESA/NASA ecliptic cruise'),
  probe('stereo-a', 'STEREO-A', 'sun', 2026, 1.0, 257, 0.1, 'Heliocentric Earth-trailing'),
  probe('voyager-1', 'Voyager 1', 'sun', 2026, 166, 259, 35, 'Interstellar — ~166 AU'),
  probe('voyager-2', 'Voyager 2', 'sun', 2026, 139, 300, -32, 'Interstellar — ~139 AU'),
  probe('pioneer-10', 'Pioneer 10', 'sun', 2003, 137, 76, 3, 'Last contact 2003; outbound toward Aldebaran'),
  probe('pioneer-11', 'Pioneer 11', 'sun', 1995, 115, 280, 17, 'Last contact 1995; outbound toward Sagittarius'),
  probe('new-horizons', 'New Horizons', 'sun', 2026, 63, 286, 2, 'Kuiper belt cruise after Pluto / Arrokoth'),
  probe('lucy', 'Lucy', 'sun', 2026, 2.2, 140, 10, 'Jupiter Trojan tour'),
  probe('psyche', 'Psyche', 'sun', 2026, 2.5, 95, 3, 'Cruise to 16 Psyche'),
  probe('juice', 'JUICE', 'sun', 2026, 1.6, 200, 2, 'Cruise to the Jupiter system (2031)'),
  probe('europa-clipper', 'Europa Clipper', 'sun', 2026, 1.3, 210, 1, 'Cruise to Jupiter / Europa (2030)'),
  probe('hayabusa2', 'Hayabusa2', 'sun', 2026, 1.1, 40, 6, 'Extended asteroid cruise after Ryugu return'),
  probe('osiris-apex', 'OSIRIS-APEX', 'sun', 2026, 1.0, 55, 6, 'Extended mission to Apophis after Bennu'),
  probe('ulysses', 'Ulysses', 'sun', 2009, 5.2, 12, 79, 'Ended 2009; high-inclination heliocentric'),
  probe('helios-1', 'Helios 1', 'sun', 1985, 0.3, 100, 0, 'Ended; close-in solar orbit'),
  probe('helios-2', 'Helios 2', 'sun', 1980, 0.29, 110, 0, 'Ended; closest pre-Parker solar perihelion'),
  probe('rosetta', 'Rosetta', 'sun', 2016, 3.5, 88, 7, 'Ended at 67P/Churyumov–Gerasimenko'),
  probe('philae', 'Philae', 'sun', 2014, 3.5, 88, 7, '67P lander; last contact 2016'),
  probe('dawn', 'Dawn', 'sun', 2018, 2.77, 160, 10, 'Ended in Ceres orbit'),
  probe('near-shoemaker', 'NEAR Shoemaker', 'sun', 2001, 1.46, 30, 10, 'Ended on Eros'),
  probe('stardust', 'Stardust', 'sun', 2011, 2.5, 70, 4, 'Ended; Wild 2 / Tempel 1 sample return'),
  probe('deep-impact', 'Deep Impact / EPOXI', 'sun', 2013, 1.6, 50, 12, 'Ended; Tempel 1 / Hartley 2'),
  probe('giotto', 'Giotto', 'sun', 1992, 1.0, 20, 2, 'Ended; Halley / Grigg–Skjellerup'),

  // Mercury
  orbiter('messenger', 'MESSENGER', 'mercury', 200, 12, 80, '2015-04-30', 'Impacted Mercury at end of mission'),
  orbiter('bepicolombo', 'BepiColombo', 'mercury', 600, 140, 90, '2026-01-01', 'Cruise / Mercury capture stand-in'),
  flyby('mariner-10', 'Mariner 10', 'mercury', 1975, 'Three Mercury flybys, 1974–1975'),

  // Venus
  orbiter('akatsuki', 'Akatsuki', 'venus', 10000, 2640, 3, '2024-09-01', 'Operations ended 2024; equatorial stand-in'),
  orbiter('venus-express', 'Venus Express', 'venus', 250, 24, 90, '2014-12-16', 'Ended; polar mapping orbit'),
  orbiter('magellan', 'Magellan', 'venus', 295, 3.26, 86, '1994-10-13', 'Deorbited; radar mapping orbit'),
  orbiter('pioneer-venus-orbiter', 'Pioneer Venus Orbiter', 'venus', 180, 24, 105, '1992-10-08', 'Ended; radar / atmosphere orbiter'),
  orbiter('venera-9-orbiter', 'Venera 9', 'venus', 1500, 48, 34, '1975-10-01', 'First Venus orbiter'),
  orbiter('venera-15', 'Venera 15', 'venus', 1000, 24, 87, '1985-07-01', 'Radar mapping orbiter'),
  lander('venera-7', 'Venera 7', 'venus', -5, 351, '1970-12-15', 'First surviving Venus landing'),
  lander('venera-8', 'Venera 8', 'venus', -10.7, 335.25, '1972-07-22', 'Dayside landing'),
  lander('venera-9', 'Venera 9 lander', 'venus', 31.01, 291.64, '1975-10-22', 'First surface images'),
  lander('venera-10', 'Venera 10 lander', 'venus', 15.42, 291.51, '1975-10-25', 'Beta Regio landing'),
  lander('venera-13', 'Venera 13', 'venus', -7.55, 303.69, '1982-03-01', 'Phoebe Regio landing'),
  lander('venera-14', 'Venera 14', 'venus', -13.25, 310.0, '1982-03-05', 'East of Phoebe Regio'),
  lander('vega-1', 'Vega 1 lander', 'venus', -7.2, 177.8, '1985-06-11', 'Venus lander + balloon; Halley flyby later'),
  lander('vega-2', 'Vega 2 lander', 'venus', -6.45, 181.08, '1985-06-15', 'Venus lander + balloon'),
  lander('pioneer-venus-large', 'Pioneer Venus Large Probe', 'venus', 4.4, 304.0, '1978-12-09', 'Atmosphere / surface impact probe'),

  // Earth — representative science / weather only.
  orbiter('iss', 'ISS', 'earth', 400, 92.9, 51.6, '2026-01-01', 'Representative LEO ring'),
  orbiter('hubble', 'Hubble', 'earth', 540, 95.4, 28.5, '2026-01-01', 'Representative LEO ring'),
  orbiter('jwst', 'James Webb Space Telescope', 'earth', 1500000, 8640, 0, '2026-01-01', 'Sun–Earth L2 stand-in'),
  orbiter('chandra', 'Chandra', 'earth', 140000, 3864, 28.5, '2026-01-01', 'Highly elliptical X-ray stand-in'),
  orbiter('xmm-newton', 'XMM-Newton', 'earth', 114000, 2880, 40, '2026-01-01', 'Highly elliptical X-ray stand-in'),
  orbiter('tess', 'TESS', 'earth', 375000, 20160, 37, '2026-01-01', 'P/2 lunar-resonant stand-in'),
  orbiter('fermi', 'Fermi', 'earth', 550, 96, 25.6, '2026-01-01', 'LEO gamma-ray stand-in'),
  orbiter('swift', 'Swift', 'earth', 600, 96.6, 20.6, '2026-01-01', 'LEO transient stand-in'),
  orbiter('terra', 'Terra', 'earth', 705, 99, 98.2, '2026-01-01', 'Sun-synchronous Earth-observing'),
  orbiter('landsat-9', 'Landsat 9', 'earth', 705, 99, 98.2, '2026-01-01', 'Sun-synchronous imaging'),
  orbiter('gps-iif', 'GPS (representative)', 'earth', 20200, 718, 55, '2026-01-01', 'Representative MEO ring'),
  orbiter('goes-16', 'GOES-16', 'earth', 35786, 1436, 0.1, '2026-01-01', 'Representative GEO ring'),
  orbiter('goes-18', 'GOES-18', 'earth', 35786, 1436, 0.1, '2026-01-01', 'GOES-West GEO stand-in'),
  orbiter('soho', 'SOHO', 'earth', 1500000, 8640, 0, '2026-01-01', 'Sun–Earth L1 solar observatory'),
  orbiter('ace', 'ACE', 'earth', 1500000, 8640, 0, '2026-01-01', 'Sun–Earth L1 solar wind'),
  orbiter('dscovr', 'DSCOVR', 'earth', 1500000, 8640, 0, '2026-01-01', 'Sun–Earth L1 Earth / solar wind'),
  orbiter('wind', 'Wind', 'earth', 1500000, 8640, 0, '2026-01-01', 'Sun–Earth L1 plasma'),

  // Moon
  orbiter('lro', 'Lunar Reconnaissance Orbiter', 'moon', 50, 113, 90, '2026-01-01', 'Polar mapping orbit'),
  orbiter('capstone', 'CAPSTONE', 'moon', 1500, 1499, 90, '2026-01-01', 'NRHO stand-in ring'),
  orbiter('chandrayaan-2', 'Chandrayaan-2', 'moon', 100, 118, 90, '2026-01-01', 'Polar mapping orbiter'),
  orbiter('danuri', 'Danuri (KPLO)', 'moon', 100, 118, 90, '2026-01-01', 'KARI polar orbiter'),
  orbiter('queqiao-2', 'Queqiao-2', 'moon', 300, 720, 54, '2026-01-01', 'Lunar relay / far-side support'),
  orbiter('change-5-orbiter', 'Chang’e 5', 'moon', 200, 130, 43, '2026-01-01', 'Extended lunar orbiter'),
  orbiter('artemis-p1', 'ARTEMIS P1', 'moon', 18000, 1440, 90, '2026-01-01', 'Lunar Lissajous / distant retrograde stand-in'),
  orbiter('artemis-p2', 'ARTEMIS P2', 'moon', 18000, 1440, 90, '2026-01-01', 'Lunar Lissajous / distant retrograde stand-in'),
  orbiter('kaguya', 'Kaguya (SELENE)', 'moon', 100, 118, 90, '2009-06-10', 'Ended; deorbited'),
  orbiter('ladee', 'LADEE', 'moon', 50, 113, 157, '2014-04-18', 'Ended; dust / atmosphere orbiter'),
  orbiter('lunar-prospector', 'Lunar Prospector', 'moon', 30, 118, 90, '1999-07-31', 'Ended; polar impact'),
  orbiter('clementine', 'Clementine', 'moon', 400, 300, 90, '1994-05-01', 'Ended; mapping tour'),
  lander('apollo-11', 'Apollo 11', 'moon', 0.67408, 23.47297, '1969-07-20', 'Tranquility Base'),
  lander('apollo-12', 'Apollo 12', 'moon', -3.01239, -23.42157, '1969-11-19', 'Ocean of Storms'),
  lander('apollo-14', 'Apollo 14', 'moon', -3.6453, -17.47136, '1971-02-05', 'Fra Mauro'),
  lander('apollo-15', 'Apollo 15', 'moon', 26.13222, 3.63386, '1971-07-30', 'Hadley–Apennine'),
  lander('apollo-16', 'Apollo 16', 'moon', -8.97301, 15.50019, '1972-04-21', 'Descartes Highlands'),
  lander('apollo-17', 'Apollo 17', 'moon', 20.1908, 30.7717, '1972-12-11', 'Taurus–Littrow'),
  rover('lunokhod-1', 'Lunokhod 1', 'moon', 38.2378, -35.0017, '1970-11-17', 'Mare Imbrium rover'),
  rover('lunokhod-2', 'Lunokhod 2', 'moon', 25.832, 30.922, '1973-01-15', 'Le Monnier crater rover'),
  lander('luna-9', 'Luna 9', 'moon', 7.08, -64.37, '1966-02-03', 'First surviving lunar landing'),
  lander('luna-16', 'Luna 16', 'moon', -0.51, 56.3, '1970-09-20', 'Mare Fecunditatis sample return'),
  lander('luna-17', 'Luna 17', 'moon', 38.2378, -35.0017, '1970-11-17', 'Lunokhod 1 lander'),
  lander('luna-20', 'Luna 20', 'moon', 3.7863, 56.6242, '1972-02-21', 'Apollonius highlands sample return'),
  lander('luna-21', 'Luna 21', 'moon', 25.85, 30.45, '1973-01-15', 'Lunokhod 2 lander'),
  lander('luna-24', 'Luna 24', 'moon', 12.7145, 62.209, '1976-08-18', 'Mare Crisium sample return'),
  lander('surveyor-1', 'Surveyor 1', 'moon', -2.474, -43.339, '1966-06-02', 'Flamsteed P'),
  lander('surveyor-3', 'Surveyor 3', 'moon', -3.016, -23.418, '1967-04-20', 'Ocean of Storms; Apollo 12 visit'),
  lander('surveyor-5', 'Surveyor 5', 'moon', 1.455, 23.195, '1967-09-11', 'Mare Tranquillitatis'),
  lander('surveyor-6', 'Surveyor 6', 'moon', 0.473, -1.427, '1967-11-10', 'Sinus Medii'),
  lander('surveyor-7', 'Surveyor 7', 'moon', -40.981, -11.528, '1968-01-10', 'Tycho ejecta'),
  lander('change-3', 'Chang’e 3', 'moon', 44.1214, -19.5116, '2013-12-14', 'Mare Imbrium lander'),
  rover('yutu', 'Yutu', 'moon', 44.12, -19.51, '2016-07-31', 'Chang’e 3 rover; last published'),
  lander('change-4', 'Chang’e 4', 'moon', -45.4446, -177.5991, '2019-01-03', 'Von Kármán crater, far side'),
  rover('yutu-2', 'Yutu-2', 'moon', -45.4446, -177.5991, '2024-01-01', 'Von Kármán crater, last published'),
  lander('change-6', 'Chang’e 6', 'moon', -41.6386, -153.9855, '2024-06-02', 'Apollo basin sample return'),
  lander('vikram', 'Vikram', 'moon', -69.373, 32.319, '2023-08-23', 'Shiv Shakti Point'),
  rover('pragyan', 'Pragyan', 'moon', -69.373, 32.319, '2023-08-23', 'Chandrayaan-3 rover'),
  lander('slim', 'SLIM', 'moon', -13.316, 25.251, '2024-01-19', 'Shioli crater; pinpoint landing'),
  lander('im-1-odysseus', 'Odysseus (IM-1)', 'moon', -80.13, -1.44, '2024-02-22', 'Malapert A; first commercial landing'),
  lander('blue-ghost', 'Blue Ghost', 'moon', 18.56, 61.81, '2025-03-02', 'Mare Crisium; Firefly CLPS'),

  // Mars
  orbiter('mro', 'Mars Reconnaissance Orbiter', 'mars', 300, 112, 93, '2026-01-01', 'Sun-synchronous stand-in'),
  orbiter('maven', 'MAVEN', 'mars', 4500, 270, 75, '2026-01-01', 'Elliptical stand-in'),
  orbiter('ody', '2001 Mars Odyssey', 'mars', 400, 118, 93, '2026-01-01', 'Mapping orbit stand-in'),
  orbiter('tgo', 'Trace Gas Orbiter', 'mars', 400, 120, 74, '2026-01-01', 'Circular stand-in'),
  orbiter('hope', 'Hope / Al-Amal', 'mars', 20000, 1320, 25, '2026-01-01', 'High-altitude stand-in'),
  orbiter('tianwen-1', 'Tianwen-1', 'mars', 400, 120, 93, '2026-01-01', 'Mapping orbit stand-in'),
  orbiter('mars-express', 'Mars Express', 'mars', 300, 420, 86.3, '2026-01-01', 'ESA elliptical mapping'),
  orbiter('mom', 'Mangalyaan (MOM)', 'mars', 42000, 4392, 150, '2022-04-01', 'Ended 2022; high-apoapsis stand-in'),
  orbiter('mgs', 'Mars Global Surveyor', 'mars', 378, 118, 93, '2006-11-02', 'Ended; mapping orbit'),
  orbiter('mariner-9', 'Mariner 9', 'mars', 1400, 719, 64, '1972-10-27', 'First Mars orbiter'),
  orbiter('viking-1-orbiter', 'Viking 1 Orbiter', 'mars', 1500, 24.7, 39, '1980-08-17', 'Ended; landing-site relay'),
  orbiter('viking-2-orbiter', 'Viking 2 Orbiter', 'mars', 1500, 24.1, 80, '1978-07-25', 'Ended; high-inclination relay'),
  rover('perseverance', 'Perseverance', 'mars', 18.4446, 77.4509, '2026-01-15', 'Jezero crater, last published drive area'),
  rover('curiosity', 'Curiosity', 'mars', -4.5895, 137.4417, '2026-01-15', 'Gale crater / Mount Sharp'),
  rover('ingenuity', 'Ingenuity (retired)', 'mars', 18.465, 77.402, '2024-01-18', 'Jezero — final flight area'),
  rover('opportunity', 'Opportunity', 'mars', -2.046, 354.473, '2018-06-10', 'Meridiani Planum, last contact'),
  rover('spirit', 'Spirit', 'mars', -14.5684, 175.4726, '2010-03-22', 'Gusev crater, last contact'),
  rover('zhurong', 'Zhurong', 'mars', 25.066, 109.925, '2022-05-01', 'Utopia Planitia, last published'),
  rover('sojourner', 'Sojourner', 'mars', 19.33, 326.45, '1997-09-27', 'Ares Vallis; first Mars rover'),
  lander('tianwen-1-lander', 'Tianwen-1 Lander', 'mars', 25.066, 109.925, '2021-05-14', 'Utopia Planitia lander'),
  lander('viking-1', 'Viking 1', 'mars', 22.697, 312.05, '1982-11-13', 'Chryse Planitia lander'),
  lander('viking-2', 'Viking 2', 'mars', 47.968, 134.28, '1980-04-11', 'Utopia Planitia lander'),
  lander('pathfinder', 'Mars Pathfinder', 'mars', 19.33, 326.45, '1997-09-27', 'Ares Vallis lander'),
  lander('phoenix', 'Phoenix', 'mars', 68.2188, 234.2506, '2008-11-02', 'Vastitas Borealis polar lander'),
  lander('insight', 'InSight', 'mars', 4.5024, 135.6234, '2022-12-15', 'Elysium Planitia; last contact'),
  lander('mars-3', 'Mars 3', 'mars', -45, 202, '1971-12-02', 'First surviving Mars landing; 20 s of data'),
  lander('beagle-2', 'Beagle 2', 'mars', 11.526, 90.4295, '2003-12-25', 'Isidis Planitia; found in 2015'),
  lander('schiaparelli', 'Schiaparelli', 'mars', -2.07, 6.21, '2016-10-19', 'Meridiani crash site'),

  // Phobos
  flyby('phobos-2', 'Phobos 2', 'phobos', 1989, 'Lost during Phobos approach'),
  orbiter('mmx', 'MMX', 'phobos', 20, 8, 0, '2026-01-01', 'JAXA Martian Moons eXploration — inbound / stand-in'),

  // Jupiter system
  orbiter('juno', 'Juno', 'jupiter', 5000, 4380, 90, '2026-01-01', 'Polar stand-in'),
  orbiter('galileo', 'Galileo', 'jupiter', 15, 85, 0, '2003-09-21', 'Ended; deorbited into Jupiter'),
  flyby('pioneer-10-jupiter', 'Pioneer 10 Jupiter flyby', 'jupiter', 1973, 'First Jupiter encounter'),
  flyby('voyager-1-jupiter', 'Voyager 1 Jupiter flyby', 'jupiter', 1979, 'March 1979 encounter'),
  flyby('voyager-2-jupiter', 'Voyager 2 Jupiter flyby', 'jupiter', 1979, 'July 1979 encounter'),
  flyby('ulysses-jupiter', 'Ulysses Jupiter flyby', 'jupiter', 1992, 'Gravity assist to polar heliocentric orbit'),
  flyby('cassini-jupiter', 'Cassini Jupiter flyby', 'jupiter', 2000, 'Gravity assist en route to Saturn'),
  flyby('new-horizons-jupiter', 'New Horizons Jupiter flyby', 'jupiter', 2007, 'Gravity assist en route to Pluto'),
  flyby('galileo-io', 'Galileo Io encounters', 'io', 2002, 'Multiple Io flybys'),
  flyby('galileo-europa', 'Galileo Europa encounters', 'europa', 2000, 'Multiple Europa flybys'),
  flyby('galileo-ganymede', 'Galileo Ganymede encounters', 'ganymede', 2000, 'Multiple Ganymede flybys'),
  flyby('galileo-callisto', 'Galileo Callisto encounters', 'callisto', 2001, 'Multiple Callisto flybys'),
  orbiter('juice-ganymede', 'JUICE (Ganymede inbound)', 'ganymede', 500, 180, 86, '2026-01-01', 'Planned Ganymede orbiter after 2031'),

  // Saturn system
  orbiter('cassini', 'Cassini', 'saturn', 8000, 1188, 60, '2017-09-15', 'Ended; Grand Finale plunge'),
  flyby('pioneer-11-saturn', 'Pioneer 11 Saturn flyby', 'saturn', 1979, 'First Saturn encounter'),
  flyby('voyager-1-saturn', 'Voyager 1 Saturn flyby', 'saturn', 1980, 'November 1980 encounter'),
  flyby('voyager-2-saturn', 'Voyager 2 Saturn flyby', 'saturn', 1981, 'August 1981 encounter'),
  lander('huygens', 'Huygens', 'titan', -10.4, 192.4, '2005-01-14', 'Xanadu / Adiri landing'),
  flyby('cassini-enceladus', 'Cassini Enceladus flybys', 'enceladus', 2015, 'Plume / south-polar flybys'),
  flyby('cassini-titan', 'Cassini Titan flybys', 'titan', 2017, 'Radar / atmosphere tour'),
  flyby('cassini-iapetus', 'Cassini Iapetus flyby', 'iapetus', 2007, 'September 2007 close flyby'),
  flyby('cassini-rhea', 'Cassini Rhea flybys', 'rhea', 2013, 'Closest Rhea approaches'),
  flyby('cassini-dione', 'Cassini Dione flybys', 'dione', 2015, 'Closest Dione approaches'),
  flyby('cassini-mimas', 'Cassini Mimas flybys', 'mimas', 2010, 'Closest Mimas approaches'),

  // Uranus / Neptune
  flyby('voyager-2-uranus', 'Voyager 2 Uranus flyby', 'uranus', 1986, 'January 1986 encounter'),
  flyby('voyager-2-miranda', 'Voyager 2 Miranda', 'miranda', 1986, 'Closest Miranda images'),
  flyby('voyager-2-ariel', 'Voyager 2 Ariel', 'ariel', 1986, 'Ariel encounter imaging'),
  flyby('voyager-2-umbriel', 'Voyager 2 Umbriel', 'umbriel', 1986, 'Umbriel encounter imaging'),
  flyby('voyager-2-titania', 'Voyager 2 Titania', 'titania', 1986, 'Titania encounter imaging'),
  flyby('voyager-2-oberon', 'Voyager 2 Oberon', 'oberon', 1986, 'Oberon encounter imaging'),
  flyby('voyager-2-neptune', 'Voyager 2 Neptune flyby', 'neptune', 1989, 'August 1989 encounter'),
  flyby('voyager-2-triton', 'Voyager 2 Triton', 'triton', 1989, 'Closest Triton images'),

  // Pluto
  flyby('new-horizons-pluto', 'New Horizons Pluto flyby', 'pluto', 2015, '14 July 2015 encounter'),
  flyby('new-horizons-charon', 'New Horizons Charon', 'charon', 2015, 'Charon encounter imaging'),
]);

function orbiter(id, name, bodyId, altitudeKm, periodMin, inclinationDeg, asOf, note) {
  return Object.freeze({
    id,
    name,
    kind: 'orbiter',
    bodyId,
    altitudeKm,
    periodMin,
    inclinationDeg,
    asOf,
    note,
  });
}

function probe(id, name, bodyId, year, heliocentricAu, longitudeDeg, latitudeDeg, note) {
  return Object.freeze({
    id,
    name,
    kind: 'probe',
    bodyId,
    altitudeKm: 0,
    periodMin: 0,
    inclinationDeg: 0,
    heliocentricAu,
    longitudeDeg,
    latitudeDeg,
    asOf: `${year}-01-01`,
    note,
  });
}

function flyby(id, name, bodyId, year, note) {
  return Object.freeze({
    id,
    name,
    kind: 'probe',
    bodyId,
    altitudeKm: 8000,
    periodMin: 240,
    inclinationDeg: 30,
    asOf: `${year}-01-01`,
    note,
  });
}

function rover(id, name, bodyId, lat, lon, asOf, note) {
  return surface(id, name, 'rover', bodyId, lat, lon, asOf, note);
}

function lander(id, name, bodyId, lat, lon, asOf, note) {
  return surface(id, name, 'lander', bodyId, lat, lon, asOf, note);
}

function surface(id, name, kind, bodyId, lat, lon, asOf, note) {
  return Object.freeze({
    id,
    name,
    kind,
    bodyId,
    lat,
    lon,
    asOf,
    note,
  });
}

/** True for landed / roving surface assets. */
export function isSurfaceAsset(asset) {
  return SURFACE_KINDS.has(asset?.kind);
}

/** Assets attached to one body, orbiters first. */
export function assetsForBody(bodyId) {
  const id = String(bodyId || '').toLowerCase();
  const order = { orbiter: 0, probe: 1, rover: 2, lander: 3 };
  return PLANETARY_ASSETS.filter((row) => row.bodyId === id).sort((a, b) => {
    const kind = (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
    return kind || a.name.localeCompare(b.name);
  });
}

/** Heliocentric probes drawn on the system overview. */
export function heliocentricAssets() {
  return assetsForBody('sun');
}

/** One catalog row, or null. */
export function getPlanetaryAsset(id) {
  const key = String(id || '').trim().toLowerCase();
  return PLANETARY_ASSETS.find((row) => row.id === key) || null;
}

/**
 * Coarse mission status inferred from the public note.
 * @returns {'active'|'ended'|'cruise'}
 */
export function assetStatus(asset) {
  const note = String(asset?.note || '').toLowerCase();
  if (
    /\b(?:ended|last contact|deorbit(?:ed)?|impact|retired|crash|lost during|final flight|found in)\b/.test(
      note,
    )
  )
    return 'ended';
  if (/\b(?:cruise|inbound|planned)\b/.test(note)) return 'cruise';
  return 'active';
}

/** World-space stand-in for any catalog asset. */
export function assetWorldPosition(asset, epochMs, hostOrigin = null) {
  if (!asset) return null;
  if (asset.heliocentricAu) return heliocentricProbePosition(asset);
  const host = getSolarBody(asset.bodyId);
  const hostPos = hostOrigin || bodyWorldPosition(asset.bodyId, epochMs);
  if (!host || !hostPos) return null;
  const local = isSurfaceAsset(asset)
    ? roverLocalPosition(asset, host.radiusM)
    : orbiterLocalPosition(asset, host.radiusM, epochMs);
  if (!local) return null;
  return {
    x: hostPos.x + local.x,
    y: hostPos.y + local.y,
    z: hostPos.z + local.z,
  };
}

/** Filter the catalog by coarse mission status or kind. */
export function filterPlanetaryAssets(assets, filter = 'all') {
  return (assets || []).filter((asset) => {
    if (filter === 'active') return assetStatus(asset) !== 'ended';
    if (filter === 'ended') return assetStatus(asset) === 'ended';
    if (filter === 'orbiter') return asset.kind === 'orbiter';
    if (filter === 'surface') return isSurfaceAsset(asset);
    return true;
  });
}

/** Group catalog rows by kind, preserving input order. */
export function groupPlanetaryAssets(assets) {
  const groups = { orbiter: [], rover: [], lander: [], probe: [] };
  for (const asset of assets || []) {
    (groups[asset.kind] || groups.probe).push(asset);
  }
  return groups;
}

/** Every asset whose `bodyId` exists in the body catalog. */
export function validatePlanetaryAssets(bodies = SOLAR_BODIES) {
  const ids = new Set(bodies.map((row) => row.id));
  return PLANETARY_ASSETS.filter((row) => !ids.has(row.bodyId)).map(
    (row) => row.id,
  );
}

/** Surface point on the true-size ellipsoid, body-centered meters. */
export function roverLocalPosition(asset, radiusM) {
  if (!isSurfaceAsset(asset)) return null;
  const lat = (Number(asset.lat) * Math.PI) / 180;
  const lon = (Number(asset.lon) * Math.PI) / 180;
  const r = Number(radiusM) * 1.004;
  if (!(r > 0) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.cos(lat) * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}

/** Closed local orbit samples for a body-centered satellite ring. */
export function orbiterOrbitLocalPositions(asset, radiusM, samples = 72) {
  if (!orbiterLocalPosition(asset, radiusM, 0)) return [];
  const count = Math.max(16, Number(samples) || 72);
  const periodMs = Math.max(60_000, (asset.periodMin || 90) * 60_000);
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const local = orbiterLocalPosition(asset, radiusM, (i / count) * periodMs);
    if (local) points.push(local);
  }
  return points;
}

/** Orbiter / encounter offset using scene-frame altitude above the body. */
export function orbiterLocalPosition(asset, radiusM, epochMs) {
  if (!asset || !ORBIT_KINDS.has(asset.kind) || asset.heliocentricAu) return null;
  const altitudeM = Math.max(0, Number(asset.altitudeKm) || 0) * 1000;
  const radius = Number(radiusM) + altitudeM;
  const periodMs = Math.max(60_000, (asset.periodMin || 90) * 60_000);
  const phase = ((epochMs / periodMs) % 1) * Math.PI * 2;
  const inclination = ((asset.inclinationDeg || 0) * Math.PI) / 180;
  return {
    x: radius * Math.cos(phase),
    y: radius * Math.sin(phase) * Math.cos(inclination),
    z: radius * Math.sin(phase) * Math.sin(inclination),
  };
}

/** World-space stand-in for a heliocentric probe. */
export function heliocentricProbePosition(asset) {
  const au = Number(asset?.heliocentricAu);
  const lon = (Number(asset?.longitudeDeg) * Math.PI) / 180;
  const lat = (Number(asset?.latitudeDeg) * Math.PI) / 180;
  if (!(au > 0) || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const r = visualMetersFromAu(au);
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.cos(lat) * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}

/** Guard used by tests: every asset points at a known body. */
export function unknownAssetBodyIds() {
  return validatePlanetaryAssets().map((id) => {
    const asset = PLANETARY_ASSETS.find((row) => row.id === id);
    return { assetId: id, bodyId: asset?.bodyId, known: Boolean(getSolarBody(asset?.bodyId)) };
  });
}
