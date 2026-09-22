import {
  assetStatus,
  assetsForBody,
  filterPlanetaryAssets,
  groupPlanetaryAssets,
  isSurfaceAsset,
} from '../../data/planetaryAssets.js';
import { listOverviewBodies, getSolarBody, listMoonsOf } from '../../solarSystem/bodies.js';
import { liveHeliocentricAu } from '../../solarSystem/ephemeris.js';
import { formatPlanetaryData } from '../../solarSystem/planetaryData.js';

const ASSET_FILTERS = [
  { id: 'all', label: 'ALL' },
  { id: 'active', label: 'ACTIVE' },
  { id: 'ended', label: 'ENDED' },
  { id: 'orbiter', label: 'ORBITERS' },
  { id: 'surface', label: 'SURFACE' },
];

const KIND_ORDER = ['orbiter', 'rover', 'lander', 'probe'];
const KIND_HEADINGS = {
  orbiter: 'ORBITERS',
  rover: 'ROVERS',
  lander: 'LANDERS',
  probe: 'PROBES',
};

function escapeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNowAu(bodyId, epochMs) {
  const au = liveHeliocentricAu(bodyId, epochMs);
  return Number.isFinite(au) && au > 0 ? `${au.toFixed(2)} AU now` : null;
}

/** Render the Solar System context roster. */
export function renderSolarSystemPanel(
  root,
  {
    focusedBodyId,
    selectedAssetId = null,
    assetFilter = 'all',
    epochMs = Date.now(),
    onSelect,
    onSelectAsset,
    onFilter,
    onBack,
  } = {},
) {
  if (!root) return;
  const focused = focusedBodyId ? getSolarBody(focusedBodyId) : null;
  const crumb = focused
    ? `SOLAR SYSTEM / ${focused.name.toUpperCase()}`
    : 'SOLAR SYSTEM';
  const moons = focused
    ? listMoonsOf(focused.kind === 'moon' ? focused.parentId : focused.id)
    : [];
  const allAssets = assetsForBody(focused ? focused.id : 'sun');
  const assets = filterPlanetaryAssets(allAssets, assetFilter);
  const grouped = groupPlanetaryAssets(assets);
  const selected = allAssets.find((row) => row.id === selectedAssetId) || null;
  const assetHeading = focused ? 'SATELLITES & PROBES' : 'HELIOCENTRIC PROBES';
  const facts = focused ? formatPlanetaryData(focused.id) : null;
  const bodies = listOverviewBodies().filter((row) => row.id !== 'sun');
  const liveAu = focused ? formatNowAu(focused.id, epochMs) : null;
  const headerCount = focused
    ? `${countLabel(moons.length, 'moon')} · ${countLabel(allAssets.length, 'craft')}`
    : `${countLabel(bodies.length, 'world')} · ${countLabel(allAssets.length, 'probe')}`;
  const summary = focused
    ? [liveAu, facts?.summary].filter(Boolean).join(' — ')
    : 'SELECT A WORLD TO ENTER — NASA FACT SHEETS ARE BUNDLED';

  root.innerHTML = `
    <div class="solar-system-roster" aria-label="Solar System bodies">
      <div class="solar-system-roster-header">
        <div>
          <strong>${escapeText(crumb)}</strong>
          <span>${escapeText(summary)}</span>
        </div>
        <output data-solar-roster-count>${escapeText(headerCount)}</output>
      </div>
      ${
        focused
          ? `<button type="button" class="solar-system-back" data-solar-back>BACK TO SYSTEM</button>`
          : ''
      }
      <div class="solar-system-roster-list" data-solar-body-list>
        ${bodies
          .map(
            (body) =>
              `<button type="button" class="solar-system-roster-item${body.id === focusedBodyId ? ' active' : ''}" data-solar-body="${escapeText(body.id)}"><span class="solar-system-roster-marker" style="--solar-body-color:${escapeText(body.color)}"></span><span class="solar-system-roster-copy"><strong>${escapeText(body.name)}</strong><small>${escapeText(rosterBlurb(body, epochMs))}</small></span><span class="solar-system-roster-chevron">›</span></button>`,
          )
          .join('')}
      </div>
      ${
        facts
          ? `<div class="solar-system-subhead">PLANETARY DATA</div>
             <dl class="solar-system-facts" aria-label="${escapeText(facts.name)} planetary data">
               ${facts.rows
                 .map(
                   (row) =>
                     `<div><dt>${escapeText(row.label)}</dt><dd>${escapeText(row.value)}</dd></div>`,
                 )
                 .join('')}
             </dl>
             <p class="solar-system-facts-source">${escapeText(facts.source)}</p>`
          : ''
      }
      ${
        moons.length
          ? `<div class="solar-system-subhead">MOONS</div>
             <div class="solar-system-roster-list" data-solar-moon-list>
               ${moons
                 .map(
                   (moon) =>
                     `<button type="button" class="solar-system-roster-item${moon.id === focusedBodyId ? ' active' : ''}" data-solar-body="${escapeText(moon.id)}"><span class="solar-system-roster-marker" style="--solar-body-color:${escapeText(moon.color)}"></span><span class="solar-system-roster-copy"><strong>${escapeText(moon.name)}</strong><small>${escapeText(rosterBlurb(moon, epochMs))}</small></span><span class="solar-system-roster-chevron">›</span></button>`,
                 )
                 .join('')}
             </div>`
          : ''
      }
      ${
        allAssets.length
          ? `<div class="solar-system-subhead">${assetHeading}</div>
             <div class="solar-system-asset-filters" role="tablist" aria-label="Spacecraft filters">
               ${ASSET_FILTERS.map(
                 (filter) =>
                   `<button type="button" class="solar-system-asset-filter${filter.id === assetFilter ? ' active' : ''}" data-solar-filter="${filter.id}">${filter.label}</button>`,
               ).join('')}
             </div>
             ${
               selected
                 ? `<div class="solar-system-asset-inspect" data-solar-inspect>
                      <strong>${escapeText(selected.name)}</strong>
                      <small>${escapeText(selected.kind)} · ${escapeText(assetStatus(selected))} · as of ${escapeText(selected.asOf)}</small>
                      <span>${escapeText(selected.note)}</span>
                    </div>`
                 : ''
             }
             ${renderAssetGroups(grouped, selectedAssetId)}`
          : ''
      }
    </div>
  `;

  root.querySelector('[data-solar-back]')?.addEventListener('click', () => onBack?.());
  root.querySelectorAll('[data-solar-body]').forEach((button) => {
    button.addEventListener('click', () => onSelect?.(button.getAttribute('data-solar-body')));
  });
  root.querySelectorAll('[data-solar-asset]').forEach((button) => {
    button.addEventListener('click', () =>
      onSelectAsset?.(button.getAttribute('data-solar-asset')),
    );
  });
  root.querySelectorAll('[data-solar-filter]').forEach((button) => {
    button.addEventListener('click', () => onFilter?.(button.getAttribute('data-solar-filter')));
  });
}

function renderAssetGroups(grouped, selectedAssetId) {
  const sections = KIND_ORDER.map((kind) => {
    const rows = grouped[kind] || [];
    if (!rows.length) return '';
    return `<div class="solar-system-asset-group">
      <div class="solar-system-asset-kind">${KIND_HEADINGS[kind]}</div>
      <div class="solar-system-asset-list">
        ${rows.map((asset) => assetButton(asset, selectedAssetId)).join('')}
      </div>
    </div>`;
  }).filter(Boolean);
  if (!sections.length)
    return `<p class="solar-system-asset-empty">NO MATCHING CRAFT</p>`;
  return sections.join('');
}

function assetButton(asset, selectedAssetId) {
  const status = assetStatus(asset);
  const classes = [
    'solar-system-asset-item',
    asset.id === selectedAssetId ? 'active' : '',
    status === 'ended' ? 'ended' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const meta = [
    asset.kind,
    status,
    isSurfaceAsset(asset) ? 'surface' : null,
    `as of ${asset.asOf}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return `<button type="button" class="${classes}" data-solar-asset="${escapeText(asset.id)}"><strong>${escapeText(asset.name)}</strong><small>${escapeText(meta)}</small><span>${escapeText(asset.note)}</span></button>`;
}

function countLabel(count, noun) {
  if (noun === 'craft') return `${count} craft`;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function rosterBlurb(body, epochMs) {
  const facts = formatPlanetaryData(body.id);
  const live = formatNowAu(body.id, epochMs);
  const moons = body.kind === 'moon' ? 0 : listMoonsOf(body.id).length;
  const craft = assetsForBody(body.id).length;
  return [
    live || facts?.blurb || body.kind,
    moons ? countLabel(moons, 'moon') : null,
    craft ? countLabel(craft, 'craft') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
