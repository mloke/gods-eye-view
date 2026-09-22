import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANETARY_ASSETS,
  assetStatus,
  assetWorldPosition,
  assetsForBody,
  filterPlanetaryAssets,
  getPlanetaryAsset,
  roverLocalPosition,
  orbiterLocalPosition,
  orbiterOrbitLocalPositions,
  groupPlanetaryAssets,
  heliocentricAssets,
  heliocentricProbePosition,
  validatePlanetaryAssets,
} from './planetaryAssets.js';
import { getSolarBody, listOverviewBodies } from '../solarSystem/bodies.js';
import { bodyWorldPosition } from '../solarSystem/ephemeris.js';
import { TRUE_AU_M } from '../solarSystem/scale.js';

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

test('asset status, filters, and world positions cover inspectable craft', () => {
  assert.equal(getPlanetaryAsset('curiosity')?.name, 'Curiosity');
  assert.equal(assetStatus(getPlanetaryAsset('curiosity')), 'active');
  assert.equal(assetStatus(getPlanetaryAsset('opportunity')), 'ended');
  assert.equal(assetStatus(getPlanetaryAsset('hayabusa2')), 'cruise');
  const mars = assetsForBody('mars');
  assert.ok(filterPlanetaryAssets(mars, 'ended').some((row) => row.id === 'opportunity'));
  assert.equal(
    filterPlanetaryAssets(mars, 'ended').some((row) => row.id === 'curiosity'),
    false,
  );
  assert.ok(filterPlanetaryAssets(mars, 'surface').every((row) => row.kind === 'rover' || row.kind === 'lander'));
  const grouped = groupPlanetaryAssets(mars);
  assert.ok(grouped.rover.some((row) => row.id === 'perseverance'));
  const roverPos = assetWorldPosition(getPlanetaryAsset('curiosity'), Date.UTC(2026, 0, 1));
  const probePos = assetWorldPosition(getPlanetaryAsset('voyager-1'), Date.UTC(2026, 0, 1));
  assert.ok(Number.isFinite(roverPos?.x) && Number.isFinite(roverPos?.y));
  assert.ok(Number.isFinite(probePos?.x));
  const moon = getSolarBody('moon');
  const apollo = roverLocalPosition(getPlanetaryAsset('apollo-11'), moon.radiusM);
  assert.ok(Math.hypot(apollo.x, apollo.y, apollo.z) > moon.radiusM);
  const lro = orbiterLocalPosition(getPlanetaryAsset('lro'), moon.radiusM, Date.UTC(2026, 0, 1));
  const lroRange = Math.hypot(lro.x, lro.y, lro.z);
  assert.ok(Math.abs(lroRange - (moon.radiusM + 50_000)) < 1e-6);
  const pinned = { x: 10, y: 20, z: 30 };
  const anchored = assetWorldPosition(getPlanetaryAsset('lro'), Date.UTC(2026, 0, 1), pinned);
  assert.equal(Math.hypot(anchored.x - pinned.x, anchored.y - pinned.y, anchored.z - pinned.z), lroRange);
});

test('orbiter rings close after one period at true altitude', () => {
  const moon = getSolarBody('moon');
  const path = orbiterOrbitLocalPositions(getPlanetaryAsset('lro'), moon.radiusM, 48);
  assert.equal(path.length, 49);
  assert.equal(path[0].x, path[path.length - 1].x);
  assert.equal(path[0].y, path[path.length - 1].y);
  assert.equal(path[0].z, path[path.length - 1].z);
  const radius = moon.radiusM + 50_000;
  for (const point of path) {
    assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - radius) < 1e-6);
  }
  assert.equal(orbiterOrbitLocalPositions(getPlanetaryAsset('curiosity'), moon.radiusM).length, 0);
  assert.equal(orbiterOrbitLocalPositions(getPlanetaryAsset('voyager-1'), moon.radiusM).length, 0);
});

test('James Webb sits at true L2 next to Earth, not past Pluto', () => {
  const earth = getSolarBody('earth');
  const epochMs = Date.UTC(2026, 0, 1);
  const local = orbiterLocalPosition(getPlanetaryAsset('jwst'), earth.radiusM, epochMs);
  const localRange = Math.hypot(local.x, local.y, local.z);
  assert.ok(Math.abs(localRange - (earth.radiusM + 1_500_000_000)) < 1e-6);
  const earthPos = bodyWorldPosition('earth', epochMs);
  const world = assetWorldPosition(getPlanetaryAsset('jwst'), epochMs);
  const fromEarth = Math.hypot(
    world.x - earthPos.x,
    world.y - earthPos.y,
    world.z - earthPos.z,
  );
  assert.ok(fromEarth < 2_000_000_000);
  assert.ok(Math.hypot(world.x, world.y, world.z) < TRUE_AU_M * 2);
  const pluto = bodyWorldPosition('pluto', epochMs);
  assert.ok(
    Math.hypot(world.x, world.y, world.z) <
      Math.hypot(pluto.x, pluto.y, pluto.z) * 0.1,
  );
});
