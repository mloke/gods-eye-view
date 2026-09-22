import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpaceOperationSnapshot,
  noticesForLaunch,
  parseBnmRss,
  parseTfrWebText,
  selectSpaceOperationTfrs,
} from './spaceOperationRestrictions.js';
import {
  tfrListUrl,
  tfrWebTextUrl,
  uscgLaunchCoastBnmFeeds,
} from './spaceProviderRequests.js';

const BLACK_ROCK_HTML = `
NOTAM Number : FDC 6/4325
Beginning Date and Time : September 27, 2026 at 1500 UTC
Ending Date and Time : September 28, 2026 at 0100 UTC
Reason for NOTAM : TO PROVIDE A SAFE ENVIRONMENT FOR ROCKET LAUNCH ACTIVITY
Type : Space Operations
Airspace Definition: Center: On the LOVELOCK VORTAC (LLC) 315 degree radial at 50 nautical miles.
(Latitude: 40&#xBA;50'42"N, Longitude: 119&#xBA;06'44"W)
Radius: 15 nautical miles
Altitude: From the surface up to Unlimited
`;

const CAPE_BODY = `
1. SPACE LAUNCH OPERATIONS, WHICH MAY BE HAZARDOUS TO SURFACE VESSELS, WILL
BE CONDUCTED WITHIN PORTIONS OF THE FOLLOWING HAZARD AREAS FOR MPOWER-F:
A. FROM 29-16-00N/075-11-00W
TO 29-35-00N/072-08-00W
TO 29-21-00N/071-15-00W
TO 28-38-00N/071-15-00W
TO 28-19-00N/072-12-00W
TO 28-46-00N/075-11-00W TO BEGINNING
B. FROM 28-36-31N/080-35-38W
TO 28-39-00N/080-29-00W
TO 28-39-00N/080-06-00W
TO 28-33-00N/080-06-00W
TO 28-31-00N/080-22-00W
TO 28-31-00N/080-33-17W TO BEGINNING
2. HAZARD PERIODS FOR PRIMARY LAUNCH DAY AND BACKUP LAUNCH DAYS:
13/1840 SEP 26 TO 13/2110 SEP 26.
16/1840 SEP 26 TO 16/2110 SEP 26.
19/1840 SEP 26 TO 19/2110 SEP 26.
4. HAZARDOUS AREAS IDENTIFIED BY A COMMERCIAL SPACE OPERATION.
ROCKET LAUNCH ACTIVITIES MAY INCLUDE FREE FALLING DEBRIS.
CANCEL AT//192110Z SEP 26//
`;

const GUNEX_BODY = `
NAVY GUNFIRE EXERCISES.
A. FROM 36-00-00N/075-00-00W
TO 36-10-00N/074-40-00W
TO 35-50-00N/074-40-00W TO BEGINNING
13/1200 SEP 26 TO 13/1800 SEP 26.
`;

function rssItem(title, body) {
  return `<item><title><![CDATA[${title}]]></title><link>https://www.navcen.uscg.gov/broadcast-notice-to-mariners</link><description><![CDATA[${body}]]></description></item>`;
}

const CAPE_TITLE =
  'SAFETY/ATLANTIC OCEAN-FLORIDA-CAPE CANAVERAL/SPACE OPERATIONS/CGD-SE BNM 9075-26';

test('space-operation feeds stay pinned to the public FAA and launch-coast USCG origins', () => {
  assert.equal(tfrListUrl().href, 'https://tfr.faa.gov/tfrapi/exportTfrList');
  assert.equal(
    tfrWebTextUrl('6/4325').href,
    'https://tfr.faa.gov/tfrapi/getWebText?notamId=6%2F4325',
  );
  const feeds = uscgLaunchCoastBnmFeeds().map((url) => url.href);
  assert.deepEqual(feeds, [
    'https://public.govdelivery.com/topics/USDHSCG_376/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_250/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_422/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_414/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_435/feed.rss',
  ]);
});

test('only Space Operations TFR rows are selected for detail text', () => {
  const selected = selectSpaceOperationTfrs([
    { notam_id: '6/4325', type: 'SPACE OPERATIONS' },
    { notam_id: '6/4585', type: 'HAZARDS', description: 'Brownsville rocket' },
    { notam_id: '5/3678', type: 'SECURITY' },
    { notam_id: 'not-an-id', type: 'SPACE OPERATIONS' },
  ]);
  assert.deepEqual(
    selected.map((row) => row.notam_id),
    ['6/4325'],
  );
});

test('Black Rock web text becomes one rocket-launch circle', () => {
  const notice = parseTfrWebText({
    notamId: '6/4325',
    html: BLACK_ROCK_HTML,
    description: '25 ZLC AIRSPACE BLACK ROCK, NV',
    facility: 'ZLC',
    state: 'NV',
  });
  assert.equal(notice.id, 'tfr:6/4325');
  assert.equal(notice.kind, 'tfr');
  assert.equal(notice.notamId, 'FDC 6/4325');
  assert.match(notice.summary, /ROCKET LAUNCH ACTIVITY/);
  assert.equal(notice.startsAt, '2026-09-27T15:00:00.000Z');
  assert.equal(notice.endsAt, '2026-09-28T01:00:00.000Z');
  assert.equal(notice.url, 'https://tfr.faa.gov/tfr3/?page=detail_6_4325');
  assert.equal(notice.areas.length, 1);
  assert.equal(notice.areas[0].type, 'circle');
  assert.ok(Math.abs(notice.areas[0].lat - 40.845) < 1e-6);
  assert.ok(Math.abs(notice.areas[0].lon + 119.112222) < 1e-5);
  assert.equal(notice.areas[0].radiusM, 15 * 1852);
  assert.equal(
    parseTfrWebText({
      notamId: '5/3678',
      html: 'Reason for NOTAM : SECURITY Type : Security',
    }),
    null,
  );
});

test('Cape space-launch polygons are kept and gun exercises and cancellations are not', () => {
  const rss = `<rss>${rssItem(CAPE_TITLE, CAPE_BODY)}${rssItem(
    'SAFETY/ATLANTIC OCEAN-VIRGINIA CAPES/HAZ OPS/GUNEX/CGD-E BNM 0416-26',
    GUNEX_BODY,
  )}${rssItem(
    'CANCELLATION/ATLANTIC OCEAN-FLORIDA-CAPE CANAVERAL/SPACE OPERATIONS/CGD-SE BNM 9074-26',
    'THIS CANCELS BNM 9074-26',
  )}${rssItem(
    'SAFETY/ATLANTIC OCEAN/SPACE LAUNCH/BNM 8800-26',
    'SPACE LAUNCH OPERATIONS A. FROM 30-45N/80-56W TO 30-50N/80-40W TO 30-40N/80-40W TO BEGINNING 13/1200 SEP 26 TO 13/1800 SEP 26.',
  )}</rss>`;
  const notices = parseBnmRss(rss);
  assert.deepEqual(
    notices.map((notice) => notice.id),
    ['bnm:9075-26', 'bnm:8800-26'],
  );
  const cape = notices[0];
  assert.equal(cape.kind, 'ship');
  assert.equal(cape.areas.length, 2);
  assert.equal(cape.areas[0].positions.length, 6);
  assert.equal(cape.areas[1].positions.length, 6);
  assert.ok(Math.abs(cape.areas[1].positions[0].lat - (28 + 36 / 60 + 31 / 3600)) < 1e-6);
  assert.equal(cape.windows.length, 3);
  assert.equal(cape.windows[0].startsAt, '2026-09-13T18:40:00.000Z');
  assert.equal(cape.windows[2].endsAt, '2026-09-19T21:10:00.000Z');
  assert.equal(notices[1].areas[0].positions[0].lat, 30.75);
  const cancelled = parseBnmRss(
    `<rss>${rssItem(CAPE_TITLE, CAPE_BODY)}${rssItem(
      'CANCELLATION/ATLANTIC OCEAN-FLORIDA-CAPE CANAVERAL/SPACE OPERATIONS/CGD-SE BNM 9075-26',
      'THIS CANCELS THE HAZARD AREA',
    )}</rss>`,
  );
  assert.deepEqual(cancelled, []);
});

test('active closures stay on the map and expired launch windows drop off', () => {
  const snapshot = buildSpaceOperationSnapshot({
    webTexts: [
      {
        notamId: '6/4325',
        html: BLACK_ROCK_HTML,
        description: 'BLACK ROCK, NV',
      },
    ],
    rssDocuments: [`<rss>${rssItem(CAPE_TITLE, CAPE_BODY)}</rss>`],
    now: new Date('2026-09-22T12:00:00.000Z'),
  });
  assert.deepEqual(
    snapshot.notices.map((notice) => notice.id),
    ['tfr:6/4325'],
  );
  const duringLaunch = buildSpaceOperationSnapshot({
    rssDocuments: [`<rss>${rssItem(CAPE_TITLE, CAPE_BODY)}</rss>`],
    now: new Date('2026-09-16T12:00:00.000Z'),
  });
  assert.deepEqual(
    duringLaunch.notices.map((notice) => notice.id),
    ['bnm:9075-26'],
  );
});

test('a launch matches a closure when the pad is near the area and the window overlaps', () => {
  const cape = parseBnmRss(`<rss>${rssItem(CAPE_TITLE, CAPE_BODY)}</rss>`)[0];
  const tfr = parseTfrWebText({ notamId: '6/4325', html: BLACK_ROCK_HTML });
  const kennedy = {
    id: 'cape-launch',
    lat: 28.608,
    lon: -80.604,
    launchTime: '2026-09-16T19:00:00.000Z',
  };
  assert.deepEqual(
    noticesForLaunch([cape, tfr], kennedy).map((notice) => notice.id),
    ['bnm:9075-26'],
  );
  assert.equal(
    noticesForLaunch([cape], { ...kennedy, launchTime: '2026-09-20T12:00:00.000Z' })
      .length,
    0,
  );
  const blackRock = {
    id: 'black-rock',
    lat: 40.845,
    lon: -119.112222,
    launchTime: '2026-09-27T18:00:00.000Z',
  };
  assert.equal(noticesForLaunch([tfr], blackRock)[0].id, 'tfr:6/4325');
  assert.equal(
    noticesForLaunch([tfr], { ...blackRock, lat: 36.0, lon: -115.1 }).length,
    0,
  );
});
