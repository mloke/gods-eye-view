import test from 'node:test';
import assert from 'node:assert/strict';
import { J2000_JD } from './elements.js';
import { formatSolarSystemHud } from './hudReadout.js';

const J2000_MS = (J2000_JD - 2_440_587.5) * 86_400_000;

test('solar HUD shows system overview without a fake altitude', () => {
  const readout = formatSolarSystemHud({ epochMs: J2000_MS });
  assert.equal(readout.label, 'SOLAR SYSTEM');
  assert.equal(readout.alt, 'AU: ---');
});

test('solar HUD names the focused world, live AU, and selected craft', () => {
  const mars = formatSolarSystemHud({
    focusedBodyId: 'mars',
    epochMs: J2000_MS,
  });
  assert.match(mars.label, /SOLAR SYSTEM \/ MARS · 1\.\d{2} AU/);
  assert.match(mars.alt, /AU: 1\.\d{2}/);
  const inspect = formatSolarSystemHud({
    focusedBodyId: 'mars',
    selectedAssetId: 'curiosity',
    epochMs: J2000_MS,
  });
  assert.match(inspect.label, /SOLAR SYSTEM \/ MARS \/ CURIOSITY/);
  assert.equal(inspect.assetStatus, 'active');
});
