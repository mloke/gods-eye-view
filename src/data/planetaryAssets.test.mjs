import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANETARY_ASSETS,
  assetsForBody,
  heliocentricAssets,
  heliocentricProbePosition,
  validatePlanetaryAssets,
} from './planetaryAssets.js';
import { getSolarBody, listOverviewBodies } from '../solarSystem/bodies.js';

const KINDS = new Set(['orbiter', 'rover', 'lander', 'probe']);

test('every spacecraft points at a catalog body', () => {
  assert.deepEqual(validatePlanetaryAssets(), []);
  const ids = new Set();
  for (const asset of PLANETARY_ASSETS) {
    assert.equal(ids.has(asset.id), false, `duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    assert.ok(getSolarBody(asset.bodyId), `${asset.id} has unknown body ${asset.bodyId}`);
    assert.ok(asset.asOf, `${asset.id} is missing an as-of date`);
    assert.ok(KINDS.has(asset.kind), `${asset.id} has unknown kind ${asset.kind}`);
    if (asset.kind === 'rover' || asset.kind === 'lander') {
      assert.ok(Number.isFinite(asset.lat) && Number.isFinite(asset.lon));
    } else if (asset.heliocentricAu) {
      assert.ok(Number.isFinite(asset.heliocentricAu));
      assert.ok(heliocentricProbePosition(asset));
    } else {
      assert.ok(Number.isFinite(asset.altitudeKm));
    }
  }
});

test('the catalog covers the whole system, not a handful of Mars craft', () => {
  assert.ok(PLANETARY_ASSETS.length >= 100);
  assert.ok(heliocentricAssets().length >= 15);
  assert.ok(assetsForBody('moon').length >= 20);
  assert.ok(assetsForBody('mars').length >= 20);
  const planets = listOverviewBodies().filter((row) => row.id !== 'sun');
  for (const body of planets) {
    assert.ok(
      assetsForBody(body.id).length > 0,
      `${body.id} is missing satellites / probes`,
    );
  }
});
