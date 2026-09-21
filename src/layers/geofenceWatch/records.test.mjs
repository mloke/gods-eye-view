import assert from 'node:assert/strict';
import test from 'node:test';
import exampleFences from '../../../config/geofences.example.json' with { type: 'json' };
import {
  addFenceDrawVertex,
  createDrawnGeofence,
  createFenceDrawSession,
  createGeofenceEvent,
  finishFenceDrawRing,
  normalizeGeofenceEvent,
  normalizeGeofences,
  pointInFenceRing,
} from './records.js';

const fences = normalizeGeofences(exampleFences);
const barrio = fences.find((fence) => fence.stableId === 'barrio-logan-sw-i5');

test('example Barrio Logan fence loads as a closed I-5 watch zone', () => {
  assert.ok(barrio);
  assert.equal(barrio.enabled, true);
  assert.deepEqual(barrio.layers, ['sdpd-reports']);
  assert.ok(barrio.ring.length >= 3);
});

test('Home and the I-5 waterfront sit inside the watch zone; Petco stays out', () => {
  assert.equal(pointInFenceRing(barrio.ring, 32.7037, -117.14791), true);
  assert.equal(pointInFenceRing(barrio.ring, 32.70217, -117.14909), true);
  assert.equal(pointInFenceRing(barrio.ring, 32.6975, -117.155), true);
  assert.equal(pointInFenceRing(barrio.ring, 32.7073, -117.1566), false);
});

test('SDPD rows become durable watch events only inside an enabled fence', () => {
  const inside = createGeofenceEvent(barrio, 'sdpd-reports', {
    stableId: 'report-a',
    offense: 'Robbery',
    category: 'Robbery',
    neighborhood: 'Barrio Logan',
    blockAddress: '1800 MAIN ST',
    caseNumber: '26000001',
    violent: true,
    lat: 32.6975,
    lon: -117.155,
    occurredOnMs: 1_700_000_000_000,
  });
  assert.equal(inside.id, 'sdpd-reports:barrio-logan-sw-i5:report-a');
  assert.equal(inside.title, 'Robbery');
  assert.equal(inside.fenceName, 'Barrio Logan SW of I-5');
  assert.equal(pointInFenceRing(barrio.ring, inside.lat, inside.lon), true);
  const restored = normalizeGeofenceEvent({
    ...inside,
    loggedAtMs: 1_700_000_100_000,
  });
  assert.equal(restored.id, inside.id);
  assert.equal(restored.title, 'Robbery');
  assert.equal(restored.loggedAtMs, 1_700_000_100_000);
  assert.equal(
    createGeofenceEvent(barrio, 'flights', {
      stableId: 'nope',
      lat: 32.6975,
      lon: -117.155,
    }),
    null,
  );
});

test('a finished map draw becomes a drawn watch zone', () => {
  const session = createFenceDrawSession();
  assert.equal(
    addFenceDrawVertex(session, { lon: -117.15, lat: 32.7 }).added,
    true,
  );
  assert.equal(
    addFenceDrawVertex(session, { lon: -117.14, lat: 32.7 }).added,
    true,
  );
  assert.equal(finishFenceDrawRing(session), null);
  assert.equal(
    addFenceDrawVertex(session, { lon: -117.14, lat: 32.71 }).added,
    true,
  );
  const ring = finishFenceDrawRing(session);
  assert.ok(ring);
  assert.equal(ring.length, 3);
  const fence = createDrawnGeofence({ name: 'Home block', ring });
  assert.equal(fence.drawn, true);
  assert.equal(fence.name, 'Home block');
  assert.equal(fence.stableId, 'drawn-1');
  assert.deepEqual(fence.layers, ['sdpd-reports']);
  assert.equal(pointInFenceRing(fence.ring, 32.703, -117.145), true);
});
