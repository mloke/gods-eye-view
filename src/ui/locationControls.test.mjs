import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationControls } from './locationControls.js';

function node() {
  const classes = new Set();
  return {
    children: [],
    dataset: {},
    listeners: new Map(),
    className: '',
    textContent: '',
    hidden: false,
    style: {},
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    getAttribute(name) {
      return this.attributes.get(name);
    },
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, enabled = !classes.has(name)) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    addEventListener(name, callback) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      this.listeners.get(name)?.delete(callback);
    },
    fire(name, event = {}) {
      for (const callback of this.listeners.get(name) || []) callback(event);
    },
    appendChild(child) {
      this.children.push(child);
      child.parent = this;
    },
    append(...children) {
      for (const child of children)
        if (typeof child !== 'string') this.appendChild(child);
    },
    replaceChildren() {
      this.children = [];
    },
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (child) => child !== this,
        );
    },
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.className === selector.slice(1) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    },
    focus() {
      this.focused = true;
    },
  };
}
function fixture() {
  const elements = {
    pills: node(),
    poiRow: node(),
    divider: node(),
    search: node(),
    searchToggle: node(),
    resetButtons: [node(), node()],
    statusCity: node(),
    statusPoi: node(),
    tabCities: node(),
    tabSaved: node(),
    citiesView: node(),
    savedView: node(),
    savedList: node(),
  };
  const doc = node();
  doc.createElement = node;
  doc.body = node();
  const cities = {
    a: { name: 'City A', pois: [{ name: 'First' }, { name: 'Second' }] },
    b: { name: 'City B', pois: [{ name: 'Elsewhere' }] },
  };
  const calls = [];
  const frames = new Map();
  const cancelled = [];
  let next = 0;
  const controls = new LocationControls({
    elements,
    cities,
    getExpandedCity: () => 'a',
    onCity: (id) => calls.push(['city', id]),
    onPoi: (id, index) => calls.push(['poi', id, index]),
    onSearch: (query) => calls.push(['search', query]),
    onReset: () => calls.push(['reset']),
    onTab: (tab) => calls.push(['tab', tab]),
    onSavedPlace: (id) => calls.push(['saved', id]),
    doc,
    requestFrame: (fn) => {
      const id = next++;
      frames.set(id, fn);
      return id;
    },
    cancelFrame: (id) => cancelled.push(id),
  });
  return { elements, doc, controls, calls, frames, cancelled };
}
test('hiding a POI row cancels frame zero and rejects an already queued expansion', () => {
  const f = fixture();
  f.controls.showPois('a');
  const callback = f.frames.get(0);
  f.controls.hidePois();
  callback();
  assert.deepEqual(f.cancelled, [0]);
  assert.equal(f.elements.poiRow.classList.contains('expanded'), false);
  assert.equal(f.elements.divider.classList.contains('visible'), false);
});
test('replacing POIs removes old click actions and presents the final row', () => {
  const f = fixture();
  f.controls.showPois('a');
  const old = f.elements.poiRow.children[0];
  f.controls.showPois('b');
  old.fire('click');
  assert.deepEqual(f.calls, []);
  f.elements.poiRow.children[0].fire('click');
  assert.deepEqual(f.calls, [['poi', 'b', 0]]);
  f.frames.get(0)();
  assert.equal(f.elements.poiRow.classList.contains('expanded'), false);
  f.frames.get(1)();
  assert.equal(f.elements.poiRow.classList.contains('expanded'), true);
});
test('destruction revokes document, search, reset, city and POI actions and removes orbit UI', () => {
  const f = fixture();
  f.controls.showPois('a');
  f.controls.createOrbitIndicator();
  assert.equal(f.doc.body.children.length, 1);
  const city = f.elements.pills.children[0];
  const poi = f.elements.poiRow.children[0];
  f.controls.destroy();
  f.controls.destroy();
  city.fire('click');
  poi.fire('click');
  f.elements.search.value = 'Place';
  f.elements.search.fire('keydown', { key: 'Enter' });
  f.doc.fire('keydown', { key: 'Q' });
  f.elements.resetButtons[0].fire('click');
  f.elements.tabSaved.fire('click');
  f.frames.get(0)();
  assert.deepEqual(f.calls, []);
  assert.equal(f.doc.body.children.length, 0);
});
test('location and POI keys route once while form controls retain typing', () => {
  const f = fixture();
  f.doc.fire('keydown', { key: 'W', target: { matches: () => false } });
  f.doc.fire('keydown', { key: 'Q', target: { matches: () => true } });
  f.elements.resetButtons[1].fire('click');
  assert.deepEqual(f.calls, [['poi', 'a', 1], ['reset']]);
});
test('the Saved tab hides cities and lists personal places', () => {
  const f = fixture();
  f.elements.tabSaved.fire('click');
  f.controls.setTab('saved');
  assert.deepEqual(f.calls, [['tab', 'saved']]);
  assert.equal(f.elements.tabSaved.classList.contains('active'), true);
  assert.equal(f.elements.tabCities.classList.contains('active'), false);
  assert.equal(f.elements.citiesView.hidden, true);
  assert.equal(f.elements.savedView.hidden, false);
  f.controls.renderSavedPlaces([
    {
      stableId: 'petco-park',
      name: 'Petco Park',
      tags: ['ballpark'],
      color: '#f0a63c',
    },
  ]);
  f.controls.setSavedCount(1);
  assert.equal(f.elements.tabSaved.textContent, 'Saved · 1');
  assert.equal(f.elements.savedList.children[0].dataset.placeId, 'petco-park');
  f.elements.savedList.children[0].fire('click');
  assert.deepEqual(f.calls, [
    ['tab', 'saved'],
    ['saved', 'petco-park'],
  ]);
  f.controls.highlightSavedPlace('petco-park');
  assert.equal(f.elements.savedList.children[0].classList.contains('active'), true);
});
test('POI keys stay quiet while the Saved tab is showing', () => {
  const f = fixture();
  f.controls.setTab('saved');
  f.doc.fire('keydown', { key: 'Q', target: { matches: () => false } });
  assert.deepEqual(f.calls, []);
});
test('replacing saved places removes old click actions', () => {
  const f = fixture();
  f.controls.renderSavedPlaces([{ stableId: 'a', name: 'A', tags: [] }]);
  const old = f.elements.savedList.children[0];
  f.controls.renderSavedPlaces([{ stableId: 'b', name: 'B', tags: [] }]);
  old.fire('click');
  assert.deepEqual(f.calls, []);
  f.elements.savedList.children[0].fire('click');
  assert.deepEqual(f.calls, [['saved', 'b']]);
});
