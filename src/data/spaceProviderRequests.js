/** Fixed upstream request URLs; callers own validation, credentials and transport. */
export function celestrakTleUrl(group) {
  const url = new URL('https://celestrak.org/NORAD/elements/gp.php');
  url.searchParams.set('GROUP', group);
  url.searchParams.set('FORMAT', 'tle');
  return url;
}

export function launchLibraryRecentUrl(end) {
  const start = new Date(end.getTime() - 30 * 86400000);
  const url = new URL('https://ll.thespacedevs.com/2.3.0/launches/');
  url.searchParams.set('net__gte', start.toISOString());
  url.searchParams.set('net__lte', end.toISOString());
  url.searchParams.set('limit', '100');
  url.searchParams.set('mode', 'detailed');
  return url;
}

/** Public FAA temporary-flight-restriction list. Callers filter Space Operations. */
export function tfrListUrl() {
  return new URL('https://tfr.faa.gov/tfrapi/exportTfrList');
}

/** Published web text for one FDC NOTAM id such as `6/4325`. */
export function tfrWebTextUrl(notamId) {
  const url = new URL('https://tfr.faa.gov/tfrapi/getWebText');
  url.searchParams.set('notamId', notamId);
  return url;
}

/**
 * Launch-coast Broadcast Notice to Mariners feeds.
 * Northeast, East (Wallops), Southeast (Cape), Heartland (Gulf), Southwest (Vandenberg).
 */
export function uscgLaunchCoastBnmFeeds() {
  return [
    'https://public.govdelivery.com/topics/USDHSCG_376/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_250/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_422/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_414/feed.rss',
    'https://public.govdelivery.com/topics/USDHSCG_435/feed.rss',
  ].map((href) => new URL(href));
}
