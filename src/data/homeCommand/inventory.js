import spec from './inventory.site.json' with { type: 'json' };

/** Globe placement for the HOME context. HomeAlone CAD is local meters. */
const SITE_GLOBE = Object.freeze({
  lon: -117.1458,
  lat: 32.6986,
});

function pick(object, keys) {
  const next = {};
  for (const key of keys) {
    if (object && object[key] !== undefined) next[key] = object[key];
  }
  return next;
}

function demoCameras(cameras) {
  return (cameras || []).map((camera) => ({
    ...pick(camera, [
      'id',
      'name',
      'zone',
      'heading',
      'fov',
      'range_m',
      'x',
      'y',
    ]),
    covers: [...(camera.covers || [])],
  }));
}

function demoSensors(sensors) {
  return (sensors || []).map((sensor) => ({
    ...pick(sensor, ['id', 'name', 'kind', 'zone', 'perimeter', 'entry_delay']),
    perimeter: Boolean(sensor.perimeter),
    entry_delay: Boolean(sensor.entry_delay),
  }));
}

function demoDefense(devices) {
  return (devices || []).map((device) => ({
    ...pick(device, ['id', 'name', 'kind', 'zone']),
    activates_for_zones: [...(device.activates_for_zones || [])],
  }));
}

/** Local HomeAlone site inventory for the Command view demo. No dedicated-PC fields. */
export function createHomeCommandInventory(source = spec) {
  const site = source?.site || {};
  const alarm = source?.alarm || {};
  return {
    site: {
      name: site.name || 'Home',
      units: site.units || 'meters',
      address: site.address || '',
      street: site.street || '',
      north_screen_deg: site.north_screen_deg ?? 135,
      lon: SITE_GLOBE.lon,
      lat: SITE_GLOBE.lat,
    },
    alarm: {
      exit_delay_s: alarm.exit_delay_s ?? 15,
      entry_delay_s: alarm.entry_delay_s ?? 20,
    },
    recognition: {
      enabled: source?.recognition?.enabled !== false,
    },
    zones: { ...(source?.zones || {}) },
    cameras: demoCameras(source?.cameras),
    sensors: demoSensors(source?.sensors),
    defense: demoDefense(source?.defense),
  };
}

export function slugCameraId(name, taken) {
  const base =
    String(name || 'camera')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'camera';
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

export function camerasCovering(inventory, sensorId) {
  return (inventory.cameras || [])
    .filter((camera) => (camera.covers || []).includes(sensorId))
    .map((camera) => camera.id);
}

export function zoneName(inventory, zoneId) {
  return inventory.zones?.[zoneId]?.name || zoneId || 'site';
}

export function sensorSpec(inventory, sensorId) {
  return (inventory.sensors || []).find((item) => item.id === sensorId) || null;
}

export function layoutCameras(inventory) {
  const poses = new Map();
  for (const camera of inventory.cameras || []) {
    if (camera.x == null || camera.y == null) continue;
    poses.set(camera.id, {
      x: camera.x,
      y: camera.y,
      heading: camera.heading ?? 270,
      fov: camera.fov ?? 90,
      range_m: camera.range_m ?? 8,
    });
  }
  return poses;
}
