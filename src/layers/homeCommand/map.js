const KIND_ORDER = [
  'lot',
  'yard',
  'driveway',
  'room',
  'building',
  'defense',
  'sensor',
  'camera',
];

function ringToPath(ring, flipY) {
  return (
    ring
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${flipY(point[1])}`)
      .join(' ') + ' Z'
  );
}

function boundsOf(features) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (point) => {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  };
  for (const feature of features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === 'Point') visit(geom.coordinates);
    if (geom.type === 'LineString') geom.coordinates.forEach(visit);
    if (geom.type === 'Polygon') geom.coordinates[0].forEach(visit);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

function fovPath(x, y, heading, fov, range, flipY) {
  const start = ((heading - fov / 2) * Math.PI) / 180;
  const end = ((heading + fov / 2) * Math.PI) / 180;
  const points = [[x, flipY(y)]];
  for (let i = 0; i <= 10; i += 1) {
    const angle = start + ((end - start) * i) / 10;
    points.push([x + Math.cos(angle) * range, flipY(y + Math.sin(angle) * range)]);
  }
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`)
    .join(' ') + ' Z';
}

function drawCamera(svg, camera, x, y, flipY, selectedId, handlers) {
  const heading = camera?.heading ?? 0;
  const fov = camera?.fov ?? 90;
  const range = camera?.range_m ?? 8;
  const cone = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  cone.setAttribute('d', fovPath(x, y, heading, fov, range, flipY));
  cone.setAttribute(
    'class',
    `fov${camera?.motion ? ' motion' : ''}${camera && !camera.online ? ' offline' : ''}`,
  );
  svg.append(cone);
  const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  point.setAttribute('cx', x);
  point.setAttribute('cy', flipY(y));
  point.setAttribute('r', '0.28');
  point.setAttribute(
    'class',
    `device camera-pt${selectedId === camera.id ? ' selected' : ''}`,
  );
  point.dataset.id = camera.id;
  point.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onSelect(camera.id);
  });
  point.addEventListener('pointerdown', (event) =>
    handlers.onCameraPointerDown(event, camera.id, 'move'),
  );
  svg.append(point);
  const rad = (heading * Math.PI) / 180;
  const reach = Math.max(1.2, range * 0.4);
  const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  handle.setAttribute('cx', x + Math.cos(rad) * reach);
  handle.setAttribute('cy', flipY(y + Math.sin(rad) * reach));
  handle.setAttribute('r', '0.2');
  handle.setAttribute(
    'class',
    `heading-handle${selectedId === camera.id ? ' selected' : ''}`,
  );
  handle.dataset.id = camera.id;
  handle.addEventListener('pointerdown', (event) =>
    handlers.onCameraPointerDown(event, camera.id, 'heading'),
  );
  svg.append(handle);
}

/** SVG CAD map from the HomeAlone command view. Kept here so GEV can inject layout without /api/layout. */
export function createHomeCommandMap(
  root,
  { onSelect, onMapClick, onCameraMove, onCameraHeading },
) {
  let layout = null;
  let lastBox = null;
  let placeMode = false;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('role', 'img');
  root.replaceChildren(svg);

  function eventToCad(event) {
    if (!lastBox) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const view = svg.viewBox.baseVal;
    const x = view.x + ((event.clientX - rect.left) / rect.width) * view.width;
    const screenY =
      view.y + ((event.clientY - rect.top) / rect.height) * view.height;
    return { x, y: lastBox.minY + lastBox.maxY - screenY };
  }

  function onCameraPointerDown(event, cameraId, mode) {
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    svg.setPointerCapture?.(pointerId);
    const apply = (next, done) => {
      const cad = eventToCad(next);
      if (!cad) return;
      if (mode === 'move') onCameraMove?.(cameraId, cad.x, cad.y, done);
      if (mode === 'heading') {
        const origin = [...svg.querySelectorAll('.camera-pt')].find(
          (node) => node.dataset.id === cameraId,
        );
        if (!origin || !lastBox) return;
        const ox = Number(origin.getAttribute('cx'));
        const oy = lastBox.minY + lastBox.maxY - Number(origin.getAttribute('cy'));
        const heading = (Math.atan2(cad.y - oy, cad.x - ox) * 180) / Math.PI;
        onCameraHeading?.(cameraId, heading, done);
      }
    };
    const move = (next) => apply(next, false);
    const up = (next) => {
      apply(next, true);
      svg.releasePointerCapture?.(pointerId);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
  }

  svg.addEventListener('click', (event) => {
    if (!placeMode) return;
    const cad = eventToCad(event);
    if (cad) onMapClick?.(cad.x, cad.y);
  });

  function draw(snapshot, selectedId) {
    if (!layout) return;
    const features = [...layout.features].sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.properties?.kind) -
        KIND_ORDER.indexOf(b.properties?.kind),
    );
    const box = boundsOf(features);
    lastBox = box;
    const pad = 1.2;
    const height = box.maxY - box.minY || 1;
    const flipY = (y) => box.minY + box.maxY - y;
    svg.setAttribute(
      'viewBox',
      `${box.minX - pad} ${box.minY - pad} ${box.maxX - box.minX + pad * 2} ${height + pad * 2}`,
    );
    svg.replaceChildren();

    const sensors = new Map((snapshot?.sensors || []).map((item) => [item.id, item]));
    const cameras = new Map((snapshot?.cameras || []).map((item) => [item.id, item]));
    const defense = new Map((snapshot?.defense || []).map((item) => [item.id, item]));
    const alarm = snapshot?.alarm?.state;
    const drawnCameras = new Set();
    const handlers = { onSelect, onCameraPointerDown };

    for (const feature of features) {
      const props = feature.properties || {};
      const deviceId = props.device_id || props.inventory_id || feature.id;
      const kind = props.kind;
      const geom = feature.geometry;
      if (!geom) continue;

      if (geom.type === 'LineString') {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
          'd',
          geom.coordinates
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${flipY(point[1])}`)
            .join(' '),
        );
        path.setAttribute('class', kind);
        path.setAttribute('fill', 'none');
        svg.append(path);
      }

      if (geom.type === 'Polygon') {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
          'd',
          geom.coordinates.map((ring) => ringToPath(ring, flipY)).join(' '),
        );
        path.setAttribute('fill-rule', 'evenodd');
        path.setAttribute('class', kind);
        const zone = props.zone;
        const zoneActive = (snapshot?.sensors || []).some(
          (sensor) => sensor.zone === zone && sensor.active,
        );
        const zoneAlert = alarm === 'triggered' && zoneActive;
        if (kind === 'room' && zoneActive)
          path.classList.add(zoneAlert ? 'alert' : 'active');
        if (
          selectedId &&
          (deviceId === selectedId || zone === selectedId || feature.id === selectedId)
        ) {
          path.classList.add('selected');
        }
        path.dataset.id = zone || feature.id;
        path.addEventListener('click', () => onSelect(path.dataset.id));
        svg.append(path);
      }

      if (kind === 'camera' && geom.type === 'Point') {
        const [x, y] = geom.coordinates;
        const camera = cameras.get(deviceId) || {
          id: deviceId,
          heading: props.heading,
          fov: props.fov,
          range_m: props.range_m,
        };
        drawnCameras.add(deviceId);
        drawCamera(svg, camera, x, y, flipY, selectedId, handlers);
      }

      if (kind === 'sensor' && geom.type === 'Point') {
        const sensor = sensors.get(deviceId);
        const alert = sensor?.active && DOOR_KINDS_HINT(sensor.kind);
        const [x, y] = geom.coordinates;
        const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        point.setAttribute('cx', x);
        point.setAttribute('cy', flipY(y));
        point.setAttribute('r', '0.24');
        point.setAttribute(
          'class',
          `device sensor-pt${sensor?.active ? (alert ? ' alert' : ' active') : ''}${selectedId === deviceId ? ' selected' : ''}`,
        );
        point.dataset.id = deviceId;
        point.addEventListener('click', () => onSelect(deviceId));
        svg.append(point);
      }

      if (kind === 'defense' && geom.type === 'Point') {
        const device = defense.get(deviceId);
        const [x, y] = geom.coordinates;
        const point = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        point.setAttribute('x', x - 0.2);
        point.setAttribute('y', flipY(y) - 0.2);
        point.setAttribute('width', '0.4');
        point.setAttribute('height', '0.4');
        point.setAttribute(
          'class',
          `device defense-pt${device?.active ? ' active' : ''}`,
        );
        point.dataset.id = deviceId;
        point.addEventListener('click', () => onSelect(deviceId));
        svg.append(point);
      }
    }

    for (const camera of snapshot?.cameras || []) {
      if (drawnCameras.has(camera.id) || camera.x == null || camera.y == null)
        continue;
      drawCamera(svg, camera, camera.x, camera.y, flipY, selectedId, handlers);
    }

    for (const track of snapshot?.tracks || []) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute(
        'class',
        `track ${track.kind}${selectedId === track.id ? ' selected' : ''}`,
      );
      group.dataset.id = track.id;
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      mark.setAttribute('cx', track.x);
      mark.setAttribute('cy', flipY(track.y));
      mark.setAttribute('r', track.kind === 'person' ? '0.42' : '0.34');
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', track.x);
      label.setAttribute('y', flipY(track.y) - 0.55);
      label.setAttribute('text-anchor', 'middle');
      label.textContent = track.label;
      group.append(mark, label);
      group.addEventListener('click', () => onSelect(track.id));
      svg.append(group);
    }
  }

  return {
    load(nextLayout) {
      layout = nextLayout;
      return layout;
    },
    draw,
    setPlaceMode(on) {
      placeMode = Boolean(on);
      root.classList.toggle('placing', placeMode);
    },
  };
}

function DOOR_KINDS_HINT(kind) {
  return kind === 'door' || kind === 'window';
}
