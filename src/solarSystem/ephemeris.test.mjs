import test from 'node:test';
import assert from 'node:assert/strict';
import { heliocentricPosition, julianDateFromMs, liveHeliocentricAu } from './ephemeris.js';
import { J2000_JD } from './elements.js';

const J2000_MS = (J2000_JD - 2_440_587.5) * 86_400_000;

test('J2000 conversion matches the JPL epoch', () => {
  assert.equal(Number(julianDateFromMs(J2000_MS).toFixed(6)), J2000_JD);
});

test('Earth at J2000 sits on the expected side of the Sun', () => {
  const earth = heliocentricPosition('earth', J2000_MS);
  assert.ok(earth);
  assert.ok(earth.x < 0, `Earth x should be negative at J2000, got ${earth.x}`);
  assert.ok(earth.y > 0, `Earth y should be positive at J2000, got ${earth.y}`);
  assert.ok(earth.au > 0.98 && earth.au < 1.02);
});

test('Earth is roughly opposite half a year later', () => {
  const later = heliocentricPosition('earth', J2000_MS + 182.625 * 86_400_000);
  assert.ok(later.x > 0, `Earth should cross to +x after half a year, got ${later.x}`);
});

test('Mars and Jupiter stay heliocentric and ordered by distance', () => {
  const mars = heliocentricPosition('mars', J2000_MS);
  const jupiter = heliocentricPosition('jupiter', J2000_MS);
  assert.ok(mars.x > 0);
  assert.ok(jupiter.au > mars.au);
  assert.ok(jupiter.au > 4.8 && jupiter.au < 5.6);
});

test('live heliocentric AU uses the parent planet for moons', () => {
  const mars = liveHeliocentricAu('mars', J2000_MS);
  const phobos = liveHeliocentricAu('phobos', J2000_MS);
  assert.ok(mars > 1.3 && mars < 1.7);
  assert.equal(phobos, mars);
  assert.equal(liveHeliocentricAu('sun', J2000_MS), 0);
});
