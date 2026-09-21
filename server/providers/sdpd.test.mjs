import assert from 'node:assert/strict';
import test from 'node:test';
import { SDPD_FEATURE_LAYER_URL } from '../../src/layers/sdpd/records.js';
import { sdpdReportsProxy } from './sdpd.js';

test('sdpd proxy fetches only the registered FeatureServer query', async () => {
  const urls = [];
  const plugin = sdpdReportsProxy({
    now: () => Date.parse('2026-09-20T18:00:00Z'),
    fetchImpl: async (url) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          features: [
            {
              attributes: {
                NIBRS_UNIQ: '1_220',
                CASE_NUMBER: '1',
                OCCURED_ON: 1_789_776_000_000,
                IBR_OFFENSE_DESCRIPTION: 'Robbery',
                PD_OFFENSE_CATEGORY: 'Robbery',
                CRIME_AGAINST: 'PE',
                VIOLENT_CRIME: 1,
                PROPERTY_CRIME: 0,
                NEIGHBORHOOD: 'East Village',
                BLOCK_ADDR: '500 J ST',
                DIVISION: 'Central',
                GEOCODE_STATUS: 'M',
              },
              geometry: { x: -117.16, y: 32.71 },
            },
          ],
        }),
        text: async () =>
          JSON.stringify({
            features: [
              {
                attributes: {
                  NIBRS_UNIQ: '1_220',
                  CASE_NUMBER: '1',
                  OCCURED_ON: 1_789_776_000_000,
                  IBR_OFFENSE_DESCRIPTION: 'Robbery',
                  PD_OFFENSE_CATEGORY: 'Robbery',
                  CRIME_AGAINST: 'PE',
                  VIOLENT_CRIME: 1,
                  PROPERTY_CRIME: 0,
                  NEIGHBORHOOD: 'East Village',
                  BLOCK_ADDR: '500 J ST',
                  DIVISION: 'Central',
                  GEOCODE_STATUS: 'M',
                },
                geometry: { x: -117.16, y: 32.71 },
              },
            ],
          }),
      };
    },
  });

  let status = 0;
  let body = '';
  let handled;
  const res = {
    headersSent: false,
    writeHead(code) {
      status = code;
    },
    end(text) {
      body = text;
    },
  };
  plugin.configureServer({
    middlewares: {
      use(path, handler) {
        assert.equal(path, '/api/sdpd-reports');
        handled = handler({ url: '/' }, res);
      },
    },
  });
  await handled;
  assert.equal(status, 200);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith(`${SDPD_FEATURE_LAYER_URL}/query?`));
  assert.match(
    decodeURIComponent(urls[0].replaceAll('+', ' ')),
    /OCCURED_ON >= DATE '2026-09-13'/,
  );
  const payload = JSON.parse(body);
  assert.equal(payload.count, 1);
  assert.equal(payload.reports[0].offense, 'Robbery');
  assert.equal(payload.windowDays, 7);

  let laterStatus = 0;
  let laterBody = '';
  const laterRes = {
    headersSent: false,
    writeHead(code) {
      laterStatus = code;
    },
    end(text) {
      laterBody = text;
    },
  };
  let laterHandled;
  plugin.configureServer({
    middlewares: {
      use(path, handler) {
        assert.equal(path, '/api/sdpd-reports');
        laterHandled = handler({ url: '/?days=30' }, laterRes);
      },
    },
  });
  await laterHandled;
  assert.equal(laterStatus, 200);
  assert.equal(urls.length, 2);
  assert.match(
    decodeURIComponent(urls[1].replaceAll('+', ' ')),
    /OCCURED_ON >= DATE '2026-08-21'/,
  );
  assert.equal(JSON.parse(laterBody).windowDays, 30);
});
