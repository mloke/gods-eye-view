import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHomeCommandInventory } from './inventory.js';
import { HOME_COMMAND_LAYOUT } from './layout.js';
import { parseYaml } from './yaml.js';

const inventoryYaml = readFileSync(
  new URL('../../../vendor/homealone/site/inventory.yaml', import.meta.url),
  'utf8',
);
const layoutGeojson = JSON.parse(
  readFileSync(
    new URL('../../../vendor/homealone/site/layout.geojson', import.meta.url),
    'utf8',
  ),
);

test('HomeAlone inventory YAML parses cameras, zones, and defense', () => {
  const spec = parseYaml(inventoryYaml);
  assert.equal(spec.site.name, 'Home');
  assert.equal(spec.cameras[0].id, 'front_door');
  assert.deepEqual(spec.cameras[0].covers, ['front_door']);
  assert.equal(spec.sensors.length, 6);
  assert.equal(spec.defense[0].kind, 'siren');
  assert.deepEqual(spec.recognition.objects, ['person', 'dog', 'cat', 'bird']);
  assert.equal(spec.alarm.entity, 'alarm_control_panel.house');
});

test('GEV site snapshots stay aligned with the HomeAlone submodule', () => {
  const spec = parseYaml(inventoryYaml);
  const inventory = createHomeCommandInventory();
  assert.deepEqual(
    inventory.cameras.map((camera) => camera.id),
    spec.cameras.map((camera) => camera.id),
  );
  assert.equal(inventory.site.address, spec.site.address);
  assert.equal(inventory.storage, undefined);
  assert.equal(inventory.cameras[0].rtsp, undefined);
  assert.equal(inventory.sensors[0].ha_entity, undefined);
  assert.deepEqual(
    HOME_COMMAND_LAYOUT.features.map((feature) => feature.id),
    layoutGeojson.features.map((feature) => feature.id),
  );
});
