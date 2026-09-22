import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeWeatherSnapshot,
  weatherSamplePoints,
  weatherSampleSpacingDeg,
  weatherViewportMoved,
} from './records.js';
import { weatherLabelTitle, mapAnalystRecord } from './model.js';

test('sample spacing coarsens as the camera climbs', () => {
  assert.equal(weatherSampleSpacingDeg(20_000), 0.25);
  assert.equal(weatherSampleSpacingDeg(100_000), 0.75);
  assert.equal(weatherSampleSpacingDeg(4_000_000), 12);
  assert.equal(weatherSampleSpacingDeg(12_000_000), 28);
});

test('a street-level view samples the camera, not a hidden ring', () => {
  const points = weatherSamplePoints({
    west: -117.1575,
    south: 32.7065,
    east: -117.1555,
    north: 32.7085,
    altitudeM: 800,
  });
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0].latitude - 32.7075) < 0.01);
  assert.ok(Math.abs(points[0].longitude - -117.1565) < 0.01);
});

test('a city viewport yields a capped grid inside the box', () => {
  const points = weatherSamplePoints({
    west: -117.4,
    south: 32.5,
    east: -116.9,
    north: 33.0,
    altitudeM: 8_000,
  });
  assert.ok(points.length >= 4);
  assert.ok(points.length <= 16);
  for (const point of points) {
    assert.ok(point.longitude >= -117.4 && point.longitude <= -116.9);
    assert.ok(point.latitude >= 32.5 && point.latitude <= 33.0);
  }
});

test('a globe-scale view still returns a usable world grid', () => {
  const points = weatherSamplePoints({
    west: -180,
    south: -55,
    east: 180,
    north: 70,
    altitudeM: 18_000_000,
  });
  assert.ok(points.length >= 4);
  assert.ok(points.length <= 16);
});

test('small camera moves do not force a refetch', () => {
  const view = {
    west: -117.2,
    south: 32.65,
    east: -117.1,
    north: 32.75,
    altitudeM: 8_000,
  };
  assert.equal(weatherViewportMoved(view, { ...view, west: -117.19 }), false);
  assert.equal(
    weatherViewportMoved(view, { ...view, west: -118.2, east: -118.0 }),
    true,
  );
  assert.equal(weatherViewportMoved(view, { ...view, altitudeM: 4_000_000 }), true);
});

test('a complete snapshot is accepted and a broken row is rejected', () => {
  const rows = normalizeWeatherSnapshot({
    samples: [
      {
        stableId: 'wx:32.70,-117.15',
        lat: 32.7,
        lon: -117.15,
        temperatureC: 19.4,
        weatherCode: 1,
        windKph: 12,
        observedAt: '2026-09-22T18:00:00Z',
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].temperatureC, 19.4);
  assert.equal(
    weatherLabelTitle(rows[0]),
    '19°C · PARTLY CLOUDY',
  );
  assert.equal(mapAnalystRecord(rows[0]).condition, 'PARTLY CLOUDY');
  assert.equal(
    normalizeWeatherSnapshot({
      samples: [{ lat: 32.7, lon: -117.15 }],
    }),
    null,
  );
});
