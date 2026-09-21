import {
  camerasCovering,
  createHomeCommandInventory,
  layoutCameras,
  sensorSpec,
  slugCameraId,
  zoneName,
} from './inventory.js';
import { HOME_COMMAND_LAYOUT, zoneAt } from './layout.js';

const DOOR_KINDS = new Set(['door', 'window']);
const MOTION_KINDS = new Set(['motion', 'presence']);

function now() {
  return Date.now();
}

function iso(value) {
  return new Date(value).toISOString();
}

function clone(value) {
  return structuredClone(value);
}

export class HomeCommandArmError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HomeCommandArmError';
  }
}

/** In-memory HomeAlone command-view house. No dedicated-PC or live backend. */
export function createHomeCommandDemo(inventory = createHomeCommandInventory()) {
  const state = {
    inventory: clone(inventory),
    alarm: { state: 'disarmed', since: now(), delay_seconds: 0 },
    cameras: [],
    sensors: [],
    defense: [],
    events: [],
    ticks: 0,
    triggerZone: null,
  };

  function addEvent(level, source, message, extra = {}) {
    state.events.unshift({
      id: `evt-${now()}-${state.events.length}`,
      ts: iso(now()),
      level,
      source,
      message,
      feature_id: extra.feature_id || null,
      zone: extra.zone || null,
      camera_id: extra.camera_id || null,
    });
    state.events = state.events.slice(0, 200);
  }

  function coveringCamera(sensorId) {
    return camerasCovering(state.inventory, sensorId)[0] || null;
  }

  function syncInventory() {
    const poses = layoutCameras(state.inventory);
    const existingCameras = new Map(state.cameras.map((item) => [item.id, item]));
    state.cameras = state.inventory.cameras.map((spec) => {
      const prior = existingCameras.get(spec.id);
      const pose = poses.get(spec.id);
      return {
        id: spec.id,
        name: spec.name,
        zone: spec.zone,
        online: prior?.online ?? true,
        motion: prior?.motion ?? false,
        heading: pose?.heading ?? spec.heading,
        fov: spec.fov,
        range_m: spec.range_m,
        covers: [...(spec.covers || [])],
        x: pose?.x ?? spec.x ?? null,
        y: pose?.y ?? spec.y ?? null,
        placed: Boolean(pose),
      };
    });
    const existingSensors = new Map(state.sensors.map((item) => [item.id, item]));
    state.sensors = state.inventory.sensors.map((spec) => {
      const prior = existingSensors.get(spec.id);
      return {
        id: spec.id,
        name: spec.name,
        kind: spec.kind,
        zone: spec.zone,
        active: prior?.active ?? false,
        since: prior?.since ?? null,
        perimeter: Boolean(spec.perimeter),
        entry_delay: Boolean(spec.entry_delay),
      };
    });
    const existingDefense = new Map(state.defense.map((item) => [item.id, item]));
    state.defense = state.inventory.defense.map((spec) => {
      const prior = existingDefense.get(spec.id);
      return {
        id: spec.id,
        name: spec.name,
        kind: spec.kind,
        zone: spec.zone,
        active: prior?.active ?? false,
        locked:
          prior?.locked ?? (spec.kind === 'lock' ? true : null),
        activates_for_zones: [...(spec.activates_for_zones || [])],
      };
    });
  }

  function setSensor(sensorId, active, message = null) {
    const sensor = state.sensors.find((item) => item.id === sensorId);
    if (!sensor) return null;
    if (sensor.active === active) return sensor;
    sensor.active = active;
    sensor.since = active ? now() : null;
    if (message) {
      let level = 'info';
      if (active && DOOR_KINDS.has(sensor.kind)) level = 'alert';
      if (active && MOTION_KINDS.has(sensor.kind)) level = 'warn';
      addEvent(level, sensor.name, message, {
        feature_id: sensor.id,
        zone: sensor.zone,
        camera_id: coveringCamera(sensor.id),
      });
    }
    for (const camera of state.cameras) {
      if ((camera.covers || []).includes(sensor.id)) {
        camera.motion = active && MOTION_KINDS.has(sensor.kind);
      }
    }
    return sensor;
  }

  function setDefense(deviceId, on) {
    const device = state.defense.find((item) => item.id === deviceId);
    if (!device) return null;
    if (device.kind === 'lock') {
      device.locked = on;
      device.active = !on;
      return device;
    }
    device.active = on;
    return device;
  }

  function armBlockers() {
    return state.sensors
      .filter((sensor) => sensor.perimeter && sensor.active)
      .map((sensor) => ({
        id: sensor.id,
        name: sensor.name,
        reason: 'still open',
        zone: sensor.zone,
      }));
  }

  function shouldTrip(sensor, alarmState) {
    const spec = sensorSpec(state.inventory, sensor.id);
    const zone = state.inventory.zones[sensor.zone];
    if (!spec || !zone) return false;
    if (alarmState === 'armed_home') {
      return Boolean(
        spec.perimeter && DOOR_KINDS.has(sensor.kind) && zone.arm_home,
      );
    }
    if (alarmState === 'armed_away' || alarmState === 'entry_delay') {
      if (DOOR_KINDS.has(sensor.kind) && spec.perimeter) return true;
      if (MOTION_KINDS.has(sensor.kind)) {
        return zone.arm_away && alarmState === 'armed_away';
      }
    }
    return false;
  }

  function activateForZone(zoneId) {
    for (const spec of state.inventory.defense) {
      if (spec.kind === 'lock') continue;
      const zones = spec.activates_for_zones || [];
      if (zones.includes('*') || (zoneId && zones.includes(zoneId)) || zoneId == null) {
        setDefense(spec.id, true);
      }
    }
  }

  function trigger(reason, featureId = null, zone = null) {
    if (state.alarm.state === 'triggered') return;
    state.alarm = { state: 'triggered', since: now(), delay_seconds: 0 };
    state.triggerZone = zone;
    activateForZone(zone);
    addEvent('alert', 'alarm', reason, {
      feature_id: featureId,
      zone,
      camera_id: featureId ? coveringCamera(featureId) : null,
    });
  }

  function handleActiveSensor(sensor) {
    const alarmState = state.alarm.state;
    if (!['armed_home', 'armed_away', 'entry_delay'].includes(alarmState)) return;
    if (!shouldTrip(sensor, alarmState)) return;
    const spec = sensorSpec(state.inventory, sensor.id);
    if (
      spec?.entry_delay &&
      alarmState === 'armed_away' &&
      DOOR_KINDS.has(sensor.kind)
    ) {
      const delay = state.inventory.alarm.entry_delay_s;
      state.alarm = { state: 'entry_delay', since: now(), delay_seconds: delay };
      addEvent('warn', 'alarm', `Entry delay ${delay}s — ${sensor.name}`, {
        feature_id: sensor.id,
        zone: sensor.zone,
        camera_id: coveringCamera(sensor.id),
      });
      return;
    }
    if (alarmState === 'entry_delay' && spec?.entry_delay) return;
    trigger(
      `Breach in ${zoneName(state.inventory, sensor.zone)}: ${sensor.name}`,
      sensor.id,
      sensor.zone,
    );
  }

  function walkInCone(pose, tick, along, slide) {
    const rad = (pose.heading * Math.PI) / 180;
    const perp = rad + Math.PI / 2;
    const reach = Math.max(2, Math.min(pose.range_m * 0.55, 6));
    const dist = reach + Math.sin(tick / along) * Math.min(1.4, pose.range_m * 0.15);
    const sway = Math.sin(tick / slide) * 0.7;
    return {
      x: pose.x + Math.cos(rad) * dist + Math.cos(perp) * sway,
      y: pose.y + Math.sin(rad) * dist + Math.sin(perp) * sway,
    };
  }

  function demoTracks() {
    if (!state.inventory.recognition.enabled) return [];
    const poses = layoutCameras(state.inventory);
    const placed = state.cameras.filter((camera) => poses.has(camera.id));
    const tracks = [];
    if (placed[0]) {
      const pose = poses.get(placed[0].id);
      const point = walkInCone(pose, state.ticks, 8, 5);
      tracks.push({
        id: 'demo-person',
        kind: 'person',
        label: 'person',
        x: point.x,
        y: point.y,
        confidence: 0.86,
        camera_ids: [placed[0].id],
        zone: zoneAt(point.x, point.y),
        since: iso(now()),
      });
    }
    if (placed[1]) {
      const pose = poses.get(placed[1].id);
      const point = walkInCone(pose, state.ticks, 6, 7);
      tracks.push({
        id: 'demo-animal',
        kind: 'animal',
        label: 'dog',
        x: point.x,
        y: point.y,
        confidence: 0.74,
        camera_ids: [placed[1].id],
        zone: zoneAt(point.x, point.y),
        since: iso(now()),
      });
    }
    return tracks;
  }

  function tick() {
    state.ticks += 1;
    if (!['triggered', 'entry_delay'].includes(state.alarm.state)) {
      for (const camera of state.cameras) {
        if (
          !state.sensors.some(
            (sensor) =>
              sensor.active &&
              MOTION_KINDS.has(sensor.kind) &&
              (camera.covers || []).includes(sensor.id),
          )
        ) {
          camera.motion = false;
        }
      }
    }
    if (state.alarm.state === 'arming') {
      const remaining = Math.max(
        0,
        Math.round(
          state.inventory.alarm.exit_delay_s -
            (now() - state.alarm.since) / 1000,
        ),
      );
      state.alarm.delay_seconds = remaining;
      if (remaining <= 0) {
        state.alarm = { state: 'armed_away', since: now(), delay_seconds: 0 };
        addEvent('info', 'alarm', 'Site armed away');
      }
    }
    if (state.alarm.state === 'entry_delay') {
      const remaining = Math.max(
        0,
        Math.round(
          state.inventory.alarm.entry_delay_s -
            (now() - state.alarm.since) / 1000,
        ),
      );
      state.alarm.delay_seconds = remaining;
      if (remaining <= 0) {
        const delayed = state.sensors.find(
          (sensor) => sensor.entry_delay && sensor.active,
        );
        trigger(
          'Entry delay expired',
          delayed?.id || null,
          delayed?.zone || 'entry',
        );
      }
    }
    if (state.ticks % 9 === 0 && state.alarm.state === 'disarmed') {
      const choices = state.sensors.filter((item) => MOTION_KINDS.has(item.kind));
      if (choices.length) {
        const sensor = choices[state.ticks % choices.length];
        setSensor(sensor.id, true, `${sensor.name} active`);
      }
    }
    if (state.ticks % 11 === 0) {
      for (const sensor of state.sensors) {
        if (
          MOTION_KINDS.has(sensor.kind) &&
          sensor.active &&
          sensor.since &&
          now() - sensor.since > 8000
        ) {
          setSensor(sensor.id, false, `${sensor.name} clear`);
        }
      }
    }
    if (['armed_home', 'armed_away', 'entry_delay'].includes(state.alarm.state)) {
      for (const sensor of state.sensors) {
        if (sensor.active) handleActiveSensor(sensor);
      }
    }
  }

  function build() {
    return {
      generated_at: iso(now()),
      mode: 'demo',
      connection: {
        home_assistant: false,
        frigate: false,
        detail: 'Local demo house — dedicated PC not connected',
      },
      alarm: {
        state: state.alarm.state,
        since: iso(state.alarm.since),
        delay_seconds: state.alarm.delay_seconds,
      },
      cameras: clone(state.cameras),
      sensors: state.sensors.map((sensor) => ({
        ...sensor,
        since: sensor.since ? iso(sensor.since) : null,
      })),
      defense: clone(state.defense),
      events: clone(state.events.slice(0, 30)),
      arm_blockers: armBlockers(),
      tracks: demoTracks(),
    };
  }

  syncInventory();
  addEvent('info', 'system', 'Command view online in demo mode');

  return {
    layout() {
      return HOME_COMMAND_LAYOUT;
    },
    site() {
      return {
        ...state.inventory.site,
        zones: clone(state.inventory.zones),
        cameras: clone(state.inventory.cameras),
        sensors: clone(state.inventory.sensors),
        defense: clone(state.inventory.defense),
        alarm: clone(state.inventory.alarm),
      };
    },
    snapshot() {
      syncInventory();
      tick();
      return build();
    },
    arm(mode) {
      syncInventory();
      const blockers = armBlockers();
      if (blockers.length) {
        const names = blockers.map((item) => item.name).join(', ');
        const message = `Cannot arm — ${names} still open`;
        addEvent('warn', 'alarm', message, {
          feature_id: blockers[0].id,
          zone: blockers[0].zone,
        });
        throw new HomeCommandArmError(message);
      }
      if (mode === 'home') {
        state.alarm = { state: 'armed_home', since: now(), delay_seconds: 0 };
        addEvent('info', 'alarm', 'Site armed home');
      } else {
        const delay = state.inventory.alarm.exit_delay_s;
        state.alarm = { state: 'arming', since: now(), delay_seconds: delay };
        addEvent('info', 'alarm', `Arming away — ${delay}s exit delay`);
      }
      return build();
    },
    disarm() {
      state.alarm = { state: 'disarmed', since: now(), delay_seconds: 0 };
      state.triggerZone = null;
      for (const spec of state.inventory.defense) {
        if (spec.kind === 'siren') setDefense(spec.id, false);
      }
      addEvent('info', 'alarm', 'Site disarmed');
      return build();
    },
    panic() {
      trigger('Panic from command view');
      return build();
    },
    setSensor(sensorId, active) {
      const sensor = state.sensors.find((item) => item.id === sensorId);
      if (!sensor) throw new Error(`Unknown sensor ${sensorId}`);
      const label = DOOR_KINDS.has(sensor.kind)
        ? active
          ? 'open'
          : 'closed'
        : active
          ? 'active'
          : 'clear';
      const updated = setSensor(sensorId, active, `${sensor.name} ${label}`);
      if (updated && active) handleActiveSensor(updated);
      return build();
    },
    setDefense(deviceId, on) {
      const device = setDefense(deviceId, on);
      if (!device) throw new Error(`Unknown device ${deviceId}`);
      const stateLabel =
        device.kind === 'lock' ? (on ? 'locked' : 'unlocked') : on ? 'on' : 'off';
      addEvent('info', device.name, `${device.name} ${stateLabel}`, {
        feature_id: device.id,
        zone: device.zone,
      });
      return build();
    },
    upsertCamera(payload, existingId = null) {
      const taken = new Set(state.inventory.cameras.map((item) => item.id));
      if (existingId) taken.delete(existingId);
      const id = existingId || slugCameraId(payload.name, taken);
      const next = {
        id,
        name: String(payload.name || 'Camera').trim() || 'Camera',
        zone: payload.zone || 'entry',
        heading: Number(payload.heading ?? 270),
        fov: Number(payload.fov ?? 90),
        range_m: Number(payload.range_m ?? 8),
        covers: [...(payload.covers || [])],
        x: payload.x ?? null,
        y: payload.y ?? null,
      };
      const index = state.inventory.cameras.findIndex((item) => item.id === id);
      if (index >= 0) state.inventory.cameras[index] = next;
      else state.inventory.cameras.push(next);
      syncInventory();
      return { camera: clone(next), snapshot: build() };
    },
    deleteCamera(cameraId) {
      state.inventory.cameras = state.inventory.cameras.filter(
        (item) => item.id !== cameraId,
      );
      syncInventory();
      addEvent('info', 'system', `Removed camera ${cameraId}`);
      return build();
    },
  };
}
