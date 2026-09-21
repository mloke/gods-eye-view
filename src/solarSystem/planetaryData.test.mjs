import test from 'node:test';
import assert from 'node:assert/strict';
import { SOLAR_BODIES } from './bodies.js';
import {
  formatPlanetaryData,
  getPlanetaryData,
  validatePlanetaryData,
} from './planetaryData.js';
import { renderSolarSystemPanel } from '../layers/solarSystem/panel.js';

test('every catalog body has a NASA fact row', () => {
  assert.deepEqual(validatePlanetaryData(), []);
  for (const body of SOLAR_BODIES) {
    const data = getPlanetaryData(body.id);
    assert.ok(data, `${body.id} is missing planetary data`);
    assert.ok(data.summary, `${body.id} needs a summary`);
    assert.ok(Number.isFinite(data.massEarths), `${body.id} needs mass`);
    assert.ok(Number.isFinite(data.gravityMps2), `${body.id} needs gravity`);
  }
});

test('Mars and Europa format into readable fact sheets', () => {
  const mars = formatPlanetaryData('mars');
  assert.equal(mars.name, 'Mars');
  assert.match(mars.blurb, /1\.52 AU/);
  assert.ok(mars.rows.some((row) => row.label === 'Gravity' && row.value.includes('3.71')));
  assert.ok(mars.rows.some((row) => row.label === 'Air' && /CO/.test(row.value)));
  const europa = formatPlanetaryData('europa');
  assert.match(europa.blurb, /moon of Jupiter/);
  assert.ok(europa.rows.some((row) => row.label === 'Jupiter'));
});

test('the Solar System panel prints planetary data for a focused world', () => {
  const root = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  renderSolarSystemPanel(root, { focusedBodyId: 'mars' });
  assert.match(root.innerHTML, /PLANETARY DATA/);
  assert.match(root.innerHTML, /Thin CO₂|Thin CO2/);
  assert.match(root.innerHTML, /NASA Planetary Fact Sheet/);
});
