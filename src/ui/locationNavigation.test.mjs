import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationNavigation } from './locationNavigation.js';

function replaceWindow(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
}

test('Saved tab flies to a personal place and frames the mini-status', async (t) => {
  replaceWindow(t, { setTimeout });
  const flights = [];
  const status = [];
  const owner = new LocationNavigation({
    viewer: {},
    services: {
      OrbitController: class {
        stop() {}
      },
      CITY_POIS: {},
      loadSavedPlaces: async () => [
        {
          stableId: 'petco-park',
          name: 'Petco Park',
          lat: 32.7073,
          lon: -117.1566,
          tags: ['ballpark'],
        },
      ],
      flyToLandmark(_viewer, lat, lon, options) {
        flights.push({ lat, lon, range: options.range });
        return { targetPosition: { lat, lon } };
      },
    },
    elements: {},
    navigation: {},
    readCockpit: () => null,
    operations: {
      _runExplicitNavigation(_noun, run) {
        return run();
      },
    },
  });
  owner._locationControls = {
    setTab(tab) {
      owner._shownTab = tab;
    },
    renderSavedPlaces(places) {
      owner._renderedPlaces = places;
    },
    highlightSavedPlace(id) {
      owner._highlightedPlace = id;
    },
    highlightCity() {},
    hidePois() {},
    setSavedCount(count) {
      owner._savedCount = count;
    },
    renderStatus(state) {
      status.push(state);
    },
    destroy() {},
  };

  await owner._loadSavedPlaces();
  owner._onLocationTab('saved');
  owner._onSavedPlaceClick('petco-park');

  assert.equal(owner._shownTab, 'saved');
  assert.equal(owner._locationTab, 'saved');
  assert.equal(owner._activeSavedPlaceId, 'petco-park');
  assert.equal(owner._highlightedPlace, 'petco-park');
  assert.equal(owner._savedCount, 1);
  assert.deepEqual(flights, [{ lat: 32.7073, lon: -117.1566, range: 800 }]);
  const last = status.at(-1);
  assert.equal(last.savedPlace.name, 'Petco Park');
  assert.equal(last.city, null);

  owner.destroy();
  owner._onSavedPlaceClick('petco-park');
  assert.equal(flights.length, 1);
});
