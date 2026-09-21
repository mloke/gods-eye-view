import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SDPD_FEATURE_LAYER_URL,
  SDPD_PAGE_SIZE,
  buildSdpdQueryUrl,
  formatSdpdQueryDate,
  normalizeSdpdFeaturePage,
  normalizeSdpdRecords,
  normalizeSdpdWindowDays,
} from './records.js';

const feature = (overrides = {}, geometry = { x: -117.16, y: 32.72 }) => ({
  attributes: {
    NIBRS_UNIQ: '3463746_220',
    CASE_NUMBER: '26035112',
    OCCURED_ON: 1_789_776_000_000,
    IBR_OFFENSE_DESCRIPTION: 'Burglary/Breaking & Entering',
    PD_OFFENSE_CATEGORY: 'Burglary/Breaking & Entering',
    CRIME_AGAINST: 'PR',
    VIOLENT_CRIME: 0,
    PROPERTY_CRIME: 1,
    NEIGHBORHOOD: "O'Farrell",
    BLOCK_ADDR: '6400 Imperial AVE',
    DIVISION: 'Southeastern',
    GEOCODE_STATUS: 'M',
    ...overrides,
  },
  geometry,
});

test('buildSdpdQueryUrl allowlists date and paging against the registered layer', () => {
  const url = buildSdpdQueryUrl({
    sinceDate: '2026-09-13',
    offset: 1000,
    recordCount: 500,
  });
  assert.ok(url.startsWith(`${SDPD_FEATURE_LAYER_URL}/query?`));
  const params = new URL(url).searchParams;
  assert.equal(params.get('where'), "OCCURED_ON >= DATE '2026-09-13'");
  assert.equal(params.get('outSR'), '4326');
  assert.equal(params.get('resultOffset'), '1000');
  assert.equal(params.get('resultRecordCount'), '500');
  assert.equal(buildSdpdQueryUrl({ sinceDate: '2026-09-13 OR 1=1' }), null);
  assert.equal(
    buildSdpdQueryUrl({ sinceDate: '2026-09-13', offset: -1 }),
    null,
  );
  assert.equal(
    buildSdpdQueryUrl({
      sinceDate: '2026-09-13',
      recordCount: SDPD_PAGE_SIZE + 1,
    }),
    null,
  );
});

test('normalizeSdpdWindowDays allowlists 1, 7, 30, and 90 days', () => {
  assert.equal(normalizeSdpdWindowDays(1), 1);
  assert.equal(normalizeSdpdWindowDays(7), 7);
  assert.equal(normalizeSdpdWindowDays('30'), 30);
  assert.equal(normalizeSdpdWindowDays(90), 90);
  assert.equal(normalizeSdpdWindowDays(14), 7);
  assert.equal(normalizeSdpdWindowDays('nope'), 7);
});

test('formatSdpdQueryDate uses the America/Los_Angeles calendar day', () => {
  assert.equal(
    formatSdpdQueryDate(Date.parse('2026-09-13T10:00:00-07:00')),
    '2026-09-13',
  );
  assert.equal(formatSdpdQueryDate('nope'), null);
});

test('normalizeSdpdFeaturePage keeps hundred-block offenses and drops unmatched geocodes', () => {
  const rows = normalizeSdpdFeaturePage({
    features: [
      feature(),
      feature({ NIBRS_UNIQ: 'unmatched_1', GEOCODE_STATUS: 'U' }),
    ],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    stableId: '3463746_220',
    caseNumber: '26035112',
    occurredOnMs: 1_789_776_000_000,
    offense: 'Burglary/Breaking & Entering',
    category: 'Burglary/Breaking & Entering',
    crimeAgainst: 'PR',
    violent: false,
    property: true,
    neighborhood: "O'Farrell",
    blockAddress: '6400 Imperial AVE',
    division: 'Southeastern',
    lon: -117.16,
    lat: 32.72,
  });
});

test('normalizeSdpdFeaturePage rejects malformed or duplicate pages', () => {
  assert.equal(normalizeSdpdFeaturePage({ error: { message: 'no' } }), null);
  assert.equal(
    normalizeSdpdFeaturePage({
      features: [feature({ NIBRS_UNIQ: 'a' }), feature({ NIBRS_UNIQ: 'a' })],
    }),
    null,
  );
  assert.equal(
    normalizeSdpdFeaturePage({
      features: [feature({}, { x: 200, y: 32.72 })],
    }),
    null,
  );
});

test('normalizeSdpdRecords validates a complete proxy payload', () => {
  const [row] = normalizeSdpdFeaturePage({ features: [feature()] });
  assert.deepEqual(normalizeSdpdRecords({ reports: [row] }), [row]);
  assert.equal(normalizeSdpdRecords({ reports: [{ ...row, lon: 200 }] }), null);
  assert.equal(normalizeSdpdRecords({}), null);
});
