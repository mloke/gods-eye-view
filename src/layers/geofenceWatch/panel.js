import { formatWatchOccurredOn } from './records.js';

function eventMeta(event) {
  const parts = [];
  const occurred = formatWatchOccurredOn(event?.occurredOnMs);
  if (occurred) parts.push(occurred);
  if (event?.neighborhood) parts.push(event.neighborhood);
  else if (event?.blockAddress) parts.push(event.blockAddress);
  if (event?.sourceLabel) parts.push(event.sourceLabel);
  return parts.join(' · ');
}

function fenceNames(fences) {
  if (!fences?.length) return '';
  if (fences.length === 1) return fences[0].name;
  return `${fences.length} zones`;
}

/** Bind the WATCH tray to one geofence-watch layer. */
export function bindGeofenceWatchPanel({
  layer,
  elements,
  flyToEvent,
  showToast,
  setEnabled,
  isEnabled,
} = {}) {
  const list = elements?.list;
  const status = elements?.status;
  const clearButton = elements?.clearButton;
  const watchButton = elements?.watchButton;
  const drawButton = elements?.drawButton;
  const nameInput = elements?.nameInput;
  const hint = elements?.hint;
  const fences = elements?.fences;
  const removers = [];
  let destroyed = false;
  let selectedId = null;
  let lastToastKey = '';
  let lastFinishedId = '';

  function listen(element, type, handler) {
    if (!element) return;
    element.addEventListener(type, handler);
    removers.push(() => element.removeEventListener(type, handler));
  }

  function drawingState() {
    return (
      layer?.getDrawState?.() || {
        active: false,
        hint: '',
        vertexCount: 0,
        finishedFence: null,
      }
    );
  }

  function renderFences(state) {
    if (!fences) return;
    fences.replaceChildren();
    for (const fence of state.fences || []) {
      const row = document.createElement('div');
      row.className = 'watch-fence';
      const name = document.createElement('span');
      name.className = 'watch-fence-name';
      name.textContent = fence.name;
      row.appendChild(name);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'watch-fence-remove';
      remove.dataset.fenceId = fence.stableId;
      remove.title = 'Remove zone';
      remove.setAttribute('aria-label', `Remove ${fence.name}`);
      remove.textContent = '×';
      row.appendChild(remove);
      fences.appendChild(row);
    }
  }

  function render() {
    if (destroyed) return;
    const state = layer?.getWatchState?.() || {
      events: [],
      fences: [],
      lastError: null,
    };
    const drawing = drawingState();
    const watching = isEnabled?.() === true;
    if (watchButton) {
      watchButton.textContent = watching ? 'WATCHING' : 'WATCH OFF';
      watchButton.setAttribute('aria-pressed', String(watching));
    }
    if (drawButton) {
      drawButton.textContent = drawing.active ? 'CANCEL' : 'DRAW ZONE';
      drawButton.setAttribute('aria-pressed', String(drawing.active));
    }
    if (hint) {
      hint.hidden = !drawing.active;
      hint.textContent = drawing.active ? drawing.hint || '' : '';
    }
    if (status) {
      if (drawing.active)
        status.textContent = drawing.hint || 'Click the map to draw the zone.';
      else if (state.lastError) status.textContent = state.lastError;
      else if (!watching)
        status.textContent =
          'Turn watch on or draw a zone to log SDPD reports.';
      else if (!state.fences.length)
        status.textContent = 'No watch zones. Draw one on the map.';
      else if (!state.events.length)
        status.textContent = `Watching ${fenceNames(state.fences)}. No reports yet.`;
      else
        status.textContent = `${state.events.length} logged · ${fenceNames(state.fences)}`;
    }
    renderFences(state);
    if (!list) return;
    list.replaceChildren();
    if (!state.events.length) {
      const empty = document.createElement('div');
      empty.className = 'watch-empty';
      empty.textContent = watching
        ? 'No matching reports in the watch zone.'
        : 'Enable watch or draw a zone to start the log.';
      list.appendChild(empty);
      return;
    }
    for (const event of state.events) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'watch-item';
      if (event.id === selectedId) button.classList.add('active');
      button.dataset.eventId = event.id;
      const swatch = document.createElement('span');
      swatch.className = 'watch-swatch';
      swatch.dataset.kind = event.violent
        ? 'violent'
        : event.property
          ? 'property'
          : 'other';
      const copy = document.createElement('span');
      copy.className = 'watch-copy';
      const name = document.createElement('span');
      name.className = 'watch-name';
      name.textContent = event.title;
      const meta = document.createElement('span');
      meta.className = 'watch-meta';
      meta.textContent = eventMeta(event);
      copy.append(name, meta);
      button.append(swatch, copy);
      list.appendChild(button);
    }
  }

  listen(list, 'click', (event) => {
    const button = event.target.closest?.('.watch-item');
    const id = button?.dataset?.eventId;
    if (!id) return;
    const row = layer
      ?.getWatchState?.()
      ?.events?.find((item) => item.id === id);
    if (!row) return;
    selectedId = id;
    layer?.selectEvent?.(id);
    flyToEvent?.(row);
    render();
  });
  listen(fences, 'click', (event) => {
    const button = event.target.closest?.('.watch-fence-remove');
    const id = button?.dataset?.fenceId;
    if (!id) return;
    const fence = layer
      ?.getWatchState?.()
      ?.fences?.find((item) => item.stableId === id);
    layer?.removeFence?.(id);
    showToast?.(fence ? `Removed ${fence.name}` : 'Removed zone');
    render();
  });
  listen(clearButton, 'click', () => {
    layer?.clearWatchLog?.();
    selectedId = null;
    showToast?.('Watch log cleared');
    render();
  });
  listen(watchButton, 'click', () => {
    const next = !(isEnabled?.() === true);
    setEnabled?.(next);
  });
  listen(drawButton, 'click', async () => {
    if (layer?.isDrawing?.()) {
      layer.cancelDrawZone?.();
      render();
      return;
    }
    try {
      if (isEnabled?.() !== true) await setEnabled?.(true);
    } catch {
      showToast?.('Could not start drawing.');
      return;
    }
    const started = layer?.startDrawZone?.({
      getName: () => nameInput?.value?.trim() || '',
    });
    if (!started?.started) {
      showToast?.(
        started?.reason === 'pointer-busy'
          ? 'Another tool is using the pointer — close it first.'
          : 'Could not start drawing.',
      );
      return;
    }
    render();
  });

  const unsubscribe = layer?.subscribeWatch?.((state) => {
    render();
    const added = state?.lastAdded || [];
    const toastKey = added.map((item) => item.id).join('|');
    if (!toastKey || toastKey === lastToastKey) return;
    lastToastKey = toastKey;
    const first = added[0];
    const zone = first.fenceName || 'watch zone';
    showToast?.(
      added.length === 1
        ? `${first.title} in ${zone}`
        : `${added.length} new reports in ${zone}`,
    );
  });
  if (typeof unsubscribe === 'function') removers.push(unsubscribe);
  const unsubscribeDraw = layer?.subscribeDraw?.((draw) => {
    const finishedId = draw?.finishedFence?.stableId || '';
    if (finishedId && finishedId !== lastFinishedId) {
      lastFinishedId = finishedId;
      if (nameInput) nameInput.value = '';
      setEnabled?.(true);
      showToast?.(`Watching ${draw.finishedFence.name}`);
    }
    render();
  });
  if (typeof unsubscribeDraw === 'function') removers.push(unsubscribeDraw);
  render();

  return {
    render,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      layer?.cancelDrawZone?.();
      for (const remove of removers.splice(0)) remove();
    },
  };
}
