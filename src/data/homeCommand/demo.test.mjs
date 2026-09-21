import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeCommandDemo, HomeCommandArmError } from './demo.js';
import { zoneAt } from './layout.js';

test('demo snapshot starts disarmed with the front-door camera placed', () => {
  const demo = createHomeCommandDemo();
  const snapshot = demo.snapshot();
  assert.equal(snapshot.mode, 'demo');
  assert.equal(snapshot.alarm.state, 'disarmed');
  assert.equal(snapshot.cameras[0].id, 'front_door');
  assert.equal(snapshot.cameras[0].placed, true);
  assert.ok(snapshot.sensors.length >= 6);
  assert.ok(snapshot.defense.some((item) => item.kind === 'siren'));
  assert.match(snapshot.events[0].message, /demo mode/i);
});

test('open perimeter sensors block arming and arm home trips a door', () => {
  const demo = createHomeCommandDemo();
  demo.snapshot();
  demo.setSensor('front_door', true);
  assert.throws(() => demo.arm('home'), HomeCommandArmError);
  demo.setSensor('front_door', false);
  const armed = demo.arm('home');
  assert.equal(armed.alarm.state, 'armed_home');
  const tripped = demo.setSensor('front_door', true);
  assert.equal(tripped.alarm.state, 'triggered');
  assert.equal(tripped.defense.find((item) => item.id === 'siren').active, true);
});

test('away arming uses an exit delay and panic triggers the site', () => {
  const demo = createHomeCommandDemo();
  demo.snapshot();
  const arming = demo.arm('away');
  assert.equal(arming.alarm.state, 'arming');
  assert.equal(arming.alarm.delay_seconds, 15);
  const panic = demo.panic();
  assert.equal(panic.alarm.state, 'triggered');
  const cleared = demo.disarm();
  assert.equal(cleared.alarm.state, 'disarmed');
  assert.equal(cleared.defense.find((item) => item.id === 'siren').active, false);
});

test('in-memory camera edits stay in the local inventory', () => {
  const demo = createHomeCommandDemo();
  const added = demo.upsertCamera({
    name: 'Driveway',
    zone: 'driveway',
    heading: 90,
    fov: 80,
    range_m: 10,
    x: 2,
    y: 3,
  });
  assert.equal(added.camera.id, 'driveway');
  assert.equal(demo.site().cameras.length, 2);
  demo.deleteCamera('driveway');
  assert.equal(demo.site().cameras.length, 1);
});

test('CAD zone lookup reports the yard polygon', () => {
  assert.equal(zoneAt(0, 10), 'yard');
  assert.equal(zoneAt(100, 100), null);
});
