import test from 'node:test';
import assert from 'node:assert/strict';
import { getSolarBody } from './bodies.js';
import { moonOffset } from './ephemeris.js';
import {
  TRUE_AU_M,
  VISUAL_AU_M,
  displayBodyRadiusM,
  enteredBodyRangeM,
  visualMoonOrbitMeters,
  visualOrbiterAltitudeM,
} from './scale.js';

test('planets, moons, and the Sun keep true radii', () => {
  const moon = getSolarBody('moon');
  const earth = getSolarBody('earth');
  const phobos = getSolarBody('phobos');
  const sun = getSolarBody('sun');
  assert.equal(VISUAL_AU_M, TRUE_AU_M);
  assert.equal(earth.visualRadiusM, earth.radiusM);
  assert.equal(moon.visualRadiusM, moon.radiusM);
  assert.equal(displayBodyRadiusM(moon), moon.radiusM);
  assert.equal(displayBodyRadiusM(earth), earth.radiusM);
  assert.equal(sun.visualRadiusM, sun.radiusM);
  assert.equal(enteredBodyRangeM(moon), moon.radiusM * 3.8);
  assert.ok(enteredBodyRangeM(phobos) >= 28_000);
  assert.ok(
    visualMoonOrbitMeters(384400, earth.radiusM) > earth.radiusM,
  );
  const offset = moonOffset('moon', Date.UTC(2026, 0, 1), earth.radiusM);
  assert.ok(Math.hypot(offset.x, offset.y, offset.z) > earth.radiusM);
});

test('orbiter altitudes stay true kilometers', () => {
  assert.equal(visualOrbiterAltitudeM(400), 400_000);
  assert.equal(visualOrbiterAltitudeM(35786), 35_786_000);
  assert.equal(visualOrbiterAltitudeM(1_500_000), 1_500_000_000);
});
