import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bodyAttitude,
  bodyOrientationComponents,
  composeTiltSpin,
  equatorialRingOffset,
} from './orientation.js';

test('Earth and Uranus keep published obliquity instead of a sun-facing pole', () => {
  const earth = bodyAttitude('earth', Date.UTC(2026, 0, 1));
  const uranus = bodyAttitude('uranus', Date.UTC(2026, 0, 1));
  const sun = bodyAttitude('sun', Date.UTC(2026, 0, 1));
  assert.ok(Math.abs(earth.tiltRad - (23.44 * Math.PI) / 180) < 1e-10);
  assert.ok(Math.abs(uranus.tiltRad - (97.77 * Math.PI) / 180) < 1e-10);
  assert.equal(sun.tiltRad, 0);
  assert.ok(earth.spinRad !== 0);
});

test('tilt then spin leaves the pole off the ecliptic Z axis', () => {
  const q = composeTiltSpin((26.73 * Math.PI) / 180, 0);
  const poleY = 2 * (q.y * q.z - q.w * q.x);
  const poleZ = 1 - 2 * (q.x * q.x + q.y * q.y);
  assert.ok(Math.abs(poleY + Math.sin((26.73 * Math.PI) / 180)) < 1e-9);
  assert.ok(Math.abs(poleZ - Math.cos((26.73 * Math.PI) / 180)) < 1e-9);
  const identity = composeTiltSpin(0, 0);
  assert.equal(identity.x, 0);
  assert.equal(identity.y, 0);
  assert.equal(identity.z, 0);
  assert.equal(identity.w, 1);
});

test('Saturn rings share the globe tilt', () => {
  const tilt = bodyAttitude('saturn').tiltRad;
  const point = equatorialRingOffset(1, Math.PI / 2, tilt);
  assert.ok(Math.abs(point.x) < 1e-12);
  assert.ok(Math.abs(point.y - Math.cos(tilt)) < 1e-12);
  assert.ok(Math.abs(point.z - Math.sin(tilt)) < 1e-12);
});
