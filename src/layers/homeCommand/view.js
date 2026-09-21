import { HomeCommandArmError } from '../../data/homeCommand/demo.js';
import { createHomeCommandMap } from './map.js';

const ALARM_LABELS = {
  disarmed: 'Site secure',
  armed_home: 'Armed home',
  armed_away: 'Armed away',
  arming: 'Arming away',
  entry_delay: 'Entry delay',
  triggered: 'Alarm triggered',
};

const CHIP_CLASS = {
  disarmed: 'chip-secure',
  armed_home: 'chip-home',
  arming: 'chip-home',
  armed_away: 'chip-alert',
  entry_delay: 'chip-alert',
  triggered: 'chip-alert',
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatTime(value) {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function relative(value) {
  if (!value) return '';
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Mount the HomeAlone command view onto GEV stage + context rail hosts. */
export function createHomeCommandView({ stage, panel, engine, onStatus } = {}) {
  const noiseJobs = new Map();
  let selectedId = null;
  let placingId = null;
  let lastSnapshot = null;
  let poseBusy = false;
  let mapCaption = '';
  let clockTimer = null;
  let map = null;
  const refs = {};

  function matchesSelection(item) {
    if (!selectedId) return true;
    return (
      item.id === selectedId ||
      item.zone === selectedId ||
      (item.covers || []).includes(selectedId)
    );
  }

  function startNoise(canvas) {
    if (noiseJobs.has(canvas)) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    let running = true;
    const draw = () => {
      if (!running || !canvas.isConnected) {
        noiseJobs.delete(canvas);
        return;
      }
      const { width, height } = canvas;
      const frame = ctx.createImageData(width, height);
      for (let i = 0; i < frame.data.length; i += 4) {
        const v = 10 + Math.random() * 22;
        frame.data[i] = v;
        frame.data[i + 1] = v + 6;
        frame.data[i + 2] = v + 12;
        frame.data[i + 3] = 255;
      }
      ctx.putImageData(frame, 0, 0);
      requestAnimationFrame(draw);
    };
    noiseJobs.set(canvas, () => {
      running = false;
    });
    draw();
  }

  function stopNoise() {
    for (const stop of noiseJobs.values()) stop();
    noiseJobs.clear();
  }

  function reportError(error) {
    const message = error?.message || String(error);
    if (refs.link) refs.link.textContent = message;
    onStatus?.(message);
  }

  function applyCommand(run) {
    try {
      renderSnapshot(run());
    } catch (error) {
      if (error instanceof HomeCommandArmError) reportError(error);
      else reportError(error);
    }
  }

  function renderCameras(cameras) {
    const visible = cameras.filter(matchesSelection);
    const showAdd = !selectedId;
    const ids = visible
      .map((camera) => camera.id)
      .concat(showAdd ? ['__add'] : [])
      .join('|');
    const existing = [...refs.wall.querySelectorAll('[data-id]')]
      .map((node) => node.dataset.id)
      .join('|');
    if (ids !== existing) {
      refs.wall.replaceChildren();
      for (const camera of visible) {
        const article = el('article', 'camera');
        article.dataset.id = camera.id;
        const feed = document.createElement('canvas');
        feed.width = 96;
        feed.height = 54;
        const meta = el('div', 'camera-meta');
        meta.append(el('span', 'camera-name'), el('span', 'rec'));
        article.append(feed, meta);
        article.addEventListener('click', () => {
          selectedId = camera.id;
          if (lastSnapshot) renderSnapshot(lastSnapshot);
        });
        article.addEventListener('dblclick', () => openCameraDialog(camera.id));
        refs.wall.append(article);
      }
      if (showAdd) {
        const add = el('button', 'camera-add', '+ Add camera');
        add.type = 'button';
        add.dataset.id = '__add';
        add.addEventListener('click', () => openCameraDialog(null));
        refs.wall.append(add);
      }
    }
    for (const camera of visible) {
      const article = refs.wall.querySelector(`[data-id="${camera.id}"]`);
      if (!article) continue;
      article.classList.toggle('motion', camera.motion);
      article.classList.toggle('offline', !camera.online);
      article.classList.toggle('unplaced', !camera.placed);
      article.classList.toggle('selected', selectedId === camera.id);
      article.querySelector('.camera-name').textContent = camera.name;
      article.querySelector('.rec').textContent = !camera.placed
        ? 'PLACE'
        : camera.motion
          ? 'MOTION'
          : camera.online
            ? 'LIVE'
            : 'OFF';
      startNoise(article.firstElementChild);
    }
  }

  function renderRows(root, items, painter) {
    root.replaceChildren();
    for (const item of items) {
      const row = el('div', 'row');
      if (selectedId && (item.id === selectedId || item.zone === selectedId))
        row.classList.add('selected');
      painter(row, item);
      root.append(row);
    }
  }

  function renderDefense(defense) {
    renderRows(refs.defense, defense, (row, device) => {
      const left = el('span');
      const on = device.kind === 'lock' ? device.locked : device.active;
      left.append(el('span', `dot${on ? ' on' : ''}`), ` ${device.name}`);
      const button = el(
        'button',
        'quiet',
        device.kind === 'lock'
          ? device.locked
            ? 'Unlock'
            : 'Lock'
          : device.active
            ? 'Turn off'
            : 'Turn on',
      );
      button.type = 'button';
      button.addEventListener('click', () =>
        applyCommand(() =>
          engine.setDefense(
            device.id,
            device.kind === 'lock' ? !device.locked : !device.active,
          ),
        ),
      );
      row.append(left, button);
    });
  }

  function renderSensors(sensors) {
    renderRows(refs.sensors, sensors.filter(matchesSelection), (row, sensor) => {
      const left = el('span');
      const alert = sensor.active && (sensor.kind === 'door' || sensor.kind === 'window');
      left.append(
        el('span', `dot${sensor.active ? (alert ? ' alert' : ' on') : ''}`),
        ` ${sensor.name}`,
      );
      left.style.cursor = 'pointer';
      left.addEventListener('click', () => {
        selectedId = sensor.id;
        if (lastSnapshot) renderSnapshot(lastSnapshot);
      });
      const label =
        sensor.kind === 'door' || sensor.kind === 'window'
          ? sensor.active
            ? 'open'
            : 'closed'
          : sensor.active
            ? 'active'
            : 'clear';
      const right = el(
        'button',
        'quiet',
        sensor.active && sensor.since ? `${label} · ${relative(sensor.since)}` : label,
      );
      right.type = 'button';
      right.addEventListener('click', () =>
        applyCommand(() => engine.setSensor(sensor.id, !sensor.active)),
      );
      row.append(left, right);
    });
  }

  function renderEvents(events) {
    refs.events.replaceChildren();
    for (const event of events) {
      const item = el('li');
      if (
        selectedId &&
        (event.feature_id === selectedId ||
          event.zone === selectedId ||
          event.camera_id === selectedId)
      ) {
        item.classList.add('selected');
      }
      item.append(el('time', null, formatTime(event.ts)), el('span', `lvl lvl-${event.level}`), el('span', null, event.message));
      item.addEventListener('click', () => {
        selectedId = event.feature_id || event.zone || event.camera_id;
        if (lastSnapshot) renderSnapshot(lastSnapshot);
      });
      refs.events.append(item);
    }
  }

  function renderBlockers(blockers) {
    refs.blockers.replaceChildren();
    for (const blocker of blockers || []) {
      const item = el('li', null, `${blocker.name} ${blocker.reason}`);
      item.addEventListener('click', () => {
        selectedId = blocker.id;
        if (lastSnapshot) renderSnapshot(lastSnapshot);
      });
      refs.blockers.append(item);
    }
  }

  function renderSnapshot(snapshot) {
    lastSnapshot = snapshot;
    const alarmState = snapshot.alarm.state;
    refs.chip.className = `chip ${CHIP_CLASS[alarmState] || 'chip-unknown'}`;
    refs.chip.textContent = ALARM_LABELS[alarmState] || alarmState;
    refs.link.textContent = `Local demo · ${snapshot.connection.detail}`;
    refs.alarmState.dataset.state = alarmState;
    refs.alarmState.textContent = ALARM_LABELS[alarmState] || alarmState;
    let extra = '';
    if (alarmState === 'arming' && snapshot.alarm.delay_seconds)
      extra = ` · ${snapshot.alarm.delay_seconds}s exit`;
    if (alarmState === 'entry_delay' && snapshot.alarm.delay_seconds)
      extra = ` · ${snapshot.alarm.delay_seconds}s to trigger`;
    refs.alarmSince.textContent = `Since ${formatTime(snapshot.alarm.since)}${extra}`;
    renderBlockers(snapshot.arm_blockers);
    renderCameras(snapshot.cameras);
    renderDefense(snapshot.defense);
    renderSensors(snapshot.sensors);
    renderEvents(snapshot.events);
    map.draw(snapshot, selectedId);
    onStatus?.(refs.chip.textContent);
  }

  function startPlace(id, name) {
    placingId = id;
    selectedId = id;
    map.setPlaceMode(true);
    refs.caption.textContent = `Click the map to place ${name}`;
  }

  function stopPlace() {
    placingId = null;
    map.setPlaceMode(false);
    if (mapCaption) refs.caption.textContent = mapCaption;
  }

  function persistCameraPose(id, patch, save) {
    poseBusy = !save;
    if (lastSnapshot) {
      const live = lastSnapshot.cameras.find((item) => item.id === id);
      if (live) {
        Object.assign(live, patch, { placed: live.x != null || patch.x != null });
        map.draw(lastSnapshot, selectedId);
      }
    }
    if (!save) return;
    const site = engine.site();
    const camera = site.cameras.find((item) => item.id === id);
    if (camera) engine.upsertCamera({ ...camera, ...patch }, id);
    if (placingId === id && (patch.x != null || patch.y != null)) stopPlace();
    poseBusy = false;
    renderSnapshot(engine.snapshot());
  }

  function fillZoneSelect(selected) {
    refs.cameraZone.replaceChildren();
    const zones = engine.site().zones || {};
    for (const [id, zone] of Object.entries(zones)) {
      const option = el('option', null, zone.name || id);
      option.value = id;
      if (id === selected) option.selected = true;
      refs.cameraZone.append(option);
    }
  }

  function openCameraDialog(cameraId) {
    const site = engine.site();
    const camera = cameraId
      ? site.cameras.find((item) => item.id === cameraId)
      : null;
    refs.cameraTitle.textContent = camera ? 'Edit camera' : 'Add camera';
    refs.cameraExistingId.value = camera?.id || '';
    refs.cameraName.value = camera?.name || '';
    fillZoneSelect(camera?.zone || 'entry');
    refs.cameraHeading.value = camera?.heading ?? 270;
    refs.cameraFov.value = camera?.fov ?? 90;
    refs.cameraRange.value = camera?.range_m ?? 8;
    refs.cameraDelete.hidden = !camera;
    refs.cameraPlace.hidden = !camera;
    refs.cameraDialog.showModal();
  }

  function mountStage() {
    stage.replaceChildren();
    stage.classList.add('home-command');
    const topbar = el('header', 'home-command-topbar');
    const brand = el('div', 'brand');
    brand.append(el('span', 'brand-mark'), el('div'));
    brand.lastElementChild.append(
      el('p', 'brand-name', 'HomeAlone'),
      el('p', 'brand-sub', 'Command view'),
    );
    refs.chip = el('div', 'chip chip-unknown', 'Linking…');
    refs.link = el('p', 'link-status', 'Local demo house');
    refs.clock = el('time', 'clock', formatClock(new Date()));
    topbar.append(brand, refs.chip, refs.link, refs.clock);

    const layout = el('div', 'home-command-layout');
    const main = el('section', 'home-command-main');
    const mapWrap = el('div', 'map-wrap');
    refs.caption = el('p', 'map-caption', 'Site map');
    const mapStage = el('div', 'map-stage');
    refs.mapRoot = el('div', 'map');
    refs.mapRoot.setAttribute('aria-label', 'Site map');
    const compass = el('div', 'compass');
    compass.innerHTML =
      '<svg viewBox="0 0 72 72" role="img"><circle class="compass-ring" cx="36" cy="36" r="33" /><g id="home-command-compass-needle"><polygon class="needle-n" points="36,8 41,38 36,34 31,38" /><polygon class="needle-s" points="36,64 41,34 36,38 31,34" /></g><text id="home-command-compass-n" class="compass-n" x="54" y="58">N</text></svg>';
    refs.street = el('p', 'street-label', 'Logan Ave');
    mapStage.append(refs.mapRoot, compass, refs.street);
    mapWrap.append(refs.caption, mapStage);
    refs.wall = el('section', 'wall');
    refs.wall.setAttribute('aria-label', 'Cameras');
    main.append(mapWrap, refs.wall);
    layout.append(main);

    const ticker = el('footer', 'ticker');
    ticker.append(el('h2', null, 'Event log'), (refs.events = el('ol')));
    stage.append(topbar, layout, ticker);

    refs.cameraDialog = el('dialog', 'home-command-dialog');
    refs.cameraDialog.id = 'home-command-camera-dialog';
    const form = el('form');
    form.id = 'home-command-camera-form';
    refs.cameraTitle = el('h2', null, 'Add camera');
    refs.cameraExistingId = el('input');
    refs.cameraExistingId.type = 'hidden';
    refs.cameraName = el('input');
    refs.cameraName.required = true;
    refs.cameraName.maxLength = 80;
    refs.cameraZone = el('select');
    refs.cameraHeading = el('input');
    refs.cameraHeading.type = 'number';
    refs.cameraFov = el('input');
    refs.cameraFov.type = 'number';
    refs.cameraRange = el('input');
    refs.cameraRange.type = 'number';
    refs.cameraPlace = el('button', 'quiet', 'Place on map');
    refs.cameraPlace.type = 'button';
    refs.cameraDelete = el('button', 'danger', 'Remove');
    refs.cameraDelete.type = 'button';
    const cancel = el('button', 'quiet', 'Cancel');
    cancel.type = 'button';
    const save = el('button', null, 'Save');
    save.type = 'submit';
    form.append(
      refs.cameraTitle,
      el('p', 'muted', 'Demo cameras stay in this session. They are not written to a dedicated PC.'),
      refs.cameraExistingId,
      labeled('Name', refs.cameraName),
      labeled('Zone', refs.cameraZone),
      labeled('Heading (degrees)', refs.cameraHeading),
      labeled('Field of view', refs.cameraFov),
      labeled('Range (meters)', refs.cameraRange),
      buttonRow(refs.cameraPlace, refs.cameraDelete),
      buttonRow(cancel, save),
    );
    refs.cameraDialog.append(form);
    stage.append(refs.cameraDialog);
    cancel.addEventListener('click', () => refs.cameraDialog.close());
    refs.cameraPlace.addEventListener('click', () => {
      const id = refs.cameraExistingId.value;
      const name = refs.cameraName.value || 'camera';
      refs.cameraDialog.close();
      if (id) startPlace(id, name);
    });
    refs.cameraDelete.addEventListener('click', () => {
      const id = refs.cameraExistingId.value;
      if (!id || !window.confirm(`Remove camera ${id}?`)) return;
      applyCommand(() => engine.deleteCamera(id));
      refs.cameraDialog.close();
      if (selectedId === id) selectedId = null;
      if (placingId === id) stopPlace();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const existingId = refs.cameraExistingId.value || null;
      const site = engine.site();
      const existing = existingId
        ? site.cameras.find((item) => item.id === existingId)
        : null;
      const result = engine.upsertCamera(
        {
          name: refs.cameraName.value,
          zone: refs.cameraZone.value,
          heading: Number(refs.cameraHeading.value),
          fov: Number(refs.cameraFov.value),
          range_m: Number(refs.cameraRange.value),
          covers: existing?.covers || [],
          x: existing?.x ?? null,
          y: existing?.y ?? null,
        },
        existingId,
      );
      refs.cameraDialog.close();
      selectedId = result.camera.id;
      renderSnapshot(result.snapshot);
      if (result.camera.x == null || result.camera.y == null)
        startPlace(result.camera.id, result.camera.name);
    });
  }

  function mountPanel() {
    if (!panel) return;
    panel.replaceChildren();
    const alarm = el('section', 'panel alarm-panel');
    alarm.append(el('h2', null, 'Site alarm'));
    refs.alarmState = el('p', 'alarm-state', '—');
    refs.alarmSince = el('p', 'muted');
    refs.blockers = el('ul', 'blockers');
    const armRow = buttonRow(
      (refs.armHome = actionButton('Arm home', () =>
        applyCommand(() => engine.arm('home')),
      )),
      (refs.armAway = actionButton('Arm away', () =>
        applyCommand(() => engine.arm('away')),
      )),
    );
    const panicRow = buttonRow(
      (refs.disarm = actionButton('Disarm', () => applyCommand(() => engine.disarm()), 'quiet')),
      (refs.panic = actionButton(
        'Panic',
        () => {
          if (!window.confirm('Trigger panic? Siren and floods will turn on.'))
            return;
          applyCommand(() => engine.panic());
        },
        'danger',
      )),
    );
    alarm.append(refs.alarmState, refs.alarmSince, refs.blockers, armRow, panicRow);
    const defense = el('section', 'panel');
    defense.append(el('h2', null, 'Defense'), (refs.defense = el('div', 'stack')));
    const sensors = el('section', 'panel');
    sensors.append(
      el('h2', null, 'Sensors'),
      el('p', 'muted', 'Click a state to toggle it in demo'),
      (refs.sensors = el('div', 'stack')),
    );
    panel.append(alarm, defense, sensors);
  }

  function labeled(title, control) {
    const label = el('label', null, title);
    label.append(control);
    return label;
  }

  function buttonRow(...buttons) {
    const row = el('div', 'button-row');
    row.append(...buttons);
    return row;
  }

  function actionButton(label, onClick, className) {
    const button = el('button', className, label);
    button.type = 'button';
    button.addEventListener('click', onClick);
    return button;
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && placingId) {
      stopPlace();
      if (lastSnapshot) renderSnapshot(lastSnapshot);
    }
  }

  return {
    mount() {
      if (!stage) return;
      mountStage();
      mountPanel();
      map = createHomeCommandMap(refs.mapRoot, {
        onSelect(id) {
          selectedId = selectedId === id ? null : id;
          if (lastSnapshot) renderSnapshot(lastSnapshot);
        },
        onMapClick(x, y) {
          if (!placingId) return;
          persistCameraPose(placingId, { x, y }, true);
        },
        onCameraMove(id, x, y, done) {
          persistCameraPose(id, { x, y }, done);
        },
        onCameraHeading(id, heading, done) {
          persistCameraPose(id, { heading }, done);
        },
      });
      const layout = map.load(engine.layout());
      const site = layout.site || {};
      refs.caption.textContent = site.address
        ? `${site.address} · layout north is bottom-right`
        : 'Site map · local demo';
      if (site.street) refs.street.textContent = site.street;
      const northDeg = Number.isFinite(site.north_screen_deg)
        ? site.north_screen_deg
        : 135;
      const needle = stage.querySelector('#home-command-compass-needle');
      const compassN = stage.querySelector('#home-command-compass-n');
      if (needle) needle.setAttribute('transform', `rotate(${northDeg} 36 36)`);
      if (compassN) {
        const rad = ((northDeg - 90) * Math.PI) / 180;
        compassN.setAttribute('x', (36 + Math.cos(rad) * 22).toFixed(1));
        compassN.setAttribute('y', (36 + Math.sin(rad) * 22 + 4).toFixed(1));
        compassN.setAttribute('text-anchor', 'middle');
      }
      mapCaption = refs.caption.textContent;
      clockTimer = setInterval(() => {
        refs.clock.textContent = formatClock(new Date());
      }, 250);
      document.addEventListener('keydown', onKeydown);
      renderSnapshot(engine.snapshot());
    },
    refresh() {
      if (!map || poseBusy) return lastSnapshot;
      renderSnapshot(engine.snapshot());
      return lastSnapshot;
    },
    destroy() {
      document.removeEventListener('keydown', onKeydown);
      if (clockTimer) clearInterval(clockTimer);
      clockTimer = null;
      stopNoise();
      if (stage) {
        stage.replaceChildren();
        stage.classList.remove('home-command');
      }
      if (panel) panel.replaceChildren();
      lastSnapshot = null;
      map = null;
    },
  };
}
