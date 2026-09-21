import { listOverviewBodies, getSolarBody, listMoonsOf } from '../../solarSystem/bodies.js';
import { formatPlanetaryData } from '../../solarSystem/planetaryData.js';
import { assetsForBody } from '../../data/planetaryAssets.js';

function escapeText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render the Solar System context roster. */
export function renderSolarSystemPanel(root, { focusedBodyId, onSelect, onBack }) {
  if (!root) return;
  const focused = focusedBodyId ? getSolarBody(focusedBodyId) : null;
  const crumb = focused
    ? `SOLAR SYSTEM / ${focused.name.toUpperCase()}`
    : 'SOLAR SYSTEM';
  const moons = focused
    ? listMoonsOf(focused.kind === 'moon' ? focused.parentId : focused.id)
    : [];
  const assets = assetsForBody(focused ? focused.id : 'sun');
  const assetHeading = focused ? 'SATELLITES & PROBES' : 'HELIOCENTRIC PROBES';
  const facts = focused ? formatPlanetaryData(focused.id) : null;
  const bodies = listOverviewBodies().filter((row) => row.id !== 'sun');

  root.innerHTML = `
    <div class="solar-system-roster" aria-label="Solar System bodies">
      <div class="solar-system-roster-header">
        <div>
          <strong>${escapeText(crumb)}</strong>
          <span>${
            facts
              ? escapeText(facts.summary)
              : 'SELECT A WORLD TO ENTER — NASA FACT SHEETS ARE BUNDLED'
          }</span>
        </div>
        <output data-solar-roster-count>${bodies.length}</output>
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
              `<button type="button" class="solar-system-roster-item${body.id === focusedBodyId ? ' active' : ''}" data-solar-body="${escapeText(body.id)}"><span class="solar-system-roster-marker" style="--solar-body-color:${escapeText(body.color)}"></span><span class="solar-system-roster-copy"><strong>${escapeText(body.name)}</strong><small>${escapeText(rosterBlurb(body))}</small></span><span class="solar-system-roster-chevron">›</span></button>`,
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
                     `<button type="button" class="solar-system-roster-item${moon.id === focusedBodyId ? ' active' : ''}" data-solar-body="${escapeText(moon.id)}"><span class="solar-system-roster-marker" style="--solar-body-color:${escapeText(moon.color)}"></span><span class="solar-system-roster-copy"><strong>${escapeText(moon.name)}</strong><small>${escapeText(rosterBlurb(moon))}</small></span><span class="solar-system-roster-chevron">›</span></button>`,
                 )
                 .join('')}
             </div>`
          : ''
      }
      ${
        assets.length
          ? `<div class="solar-system-subhead">${assetHeading}</div>
             <ul class="solar-system-asset-list">
               ${assets
                 .map(
                   (asset) =>
                     `<li><strong>${escapeText(asset.name)}</strong><small>${escapeText(asset.kind)} · as of ${escapeText(asset.asOf)}</small><span>${escapeText(asset.note)}</span></li>`,
                 )
                 .join('')}
             </ul>`
          : ''
      }
    </div>
  `;

  root.querySelector('[data-solar-back]')?.addEventListener('click', () => onBack?.());
  root.querySelectorAll('[data-solar-body]').forEach((button) => {
    button.addEventListener('click', () => onSelect?.(button.getAttribute('data-solar-body')));
  });
}

function rosterBlurb(body) {
  const facts = formatPlanetaryData(body.id);
  return facts?.blurb || body.kind;
}
