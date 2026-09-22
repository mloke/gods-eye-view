import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOLAR_BODIES,
  getSolarBody,
  isInFocusedSystem,
  isLocalSystemBody,
} from './bodies.js';

test('every moon has a texture id so close-ups are not blank spheres', () => {
  const moons = SOLAR_BODIES.filter((body) => body.kind === 'moon');
  assert.ok(moons.length >= 20);
  for (const moon of moons) {
    assert.ok(moon.textureId, `${moon.id} is missing a texture id`);
  }
});

test('moon focus stays local; planet focus keeps the whole system', () => {
  const moon = getSolarBody('moon');
  const earth = getSolarBody('earth');
  const saturn = getSolarBody('saturn');
  const sun = getSolarBody('sun');
  assert.equal(isInFocusedSystem(earth, moon), true);
  assert.equal(isInFocusedSystem(moon, moon), true);
  assert.equal(isInFocusedSystem(saturn, moon), false);
  assert.equal(isInFocusedSystem(sun, moon), false);
  assert.equal(isInFocusedSystem(saturn, earth), true);
  assert.equal(isInFocusedSystem(sun, earth), true);
  assert.equal(isInFocusedSystem(moon, earth), true);
  assert.equal(isLocalSystemBody(saturn, earth), false);
  assert.equal(isInFocusedSystem(saturn, null), true);
  assert.equal(isInFocusedSystem(moon, null), false);
});
