import * as Cesium from 'cesium';

/** Same dash-dot groups as Space Missions (`GevMissionOrbitTactical`). */
export const TACTICAL_ORBIT_GROUPS = 4;
export const TACTICAL_ORBIT_DASHES = 100;
export const TACTICAL_ORBIT_COLOR = '#22e6e6';

const MATERIAL_TYPE = 'GevMissionOrbitTactical';

let registered = false;

function ensureRegistered() {
  if (registered) return;
  if (typeof window === 'undefined') {
    registered = true;
    return;
  }
  try {
    new Cesium.Material({
      fabric: {
        type: MATERIAL_TYPE,
        uniforms: {
          color: Cesium.Color.CYAN,
          groupCount: TACTICAL_ORBIT_GROUPS,
          dashCount: TACTICAL_ORBIT_DASHES,
        },
        source: `
        czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          float groupPosition = fract(materialInput.st.s * groupCount);
          float markPosition = groupPosition * (dashCount + 1.0);
          float markIndex = floor(markPosition);
          float localPosition = fract(markPosition);
          float centerDistance = abs(localPosition - 0.5);
          float edge = max(fwidth(localPosition) * 1.35, 0.012);
          float dashAlong = 1.0 - smoothstep(0.27 - edge, 0.27 + edge, centerDistance);
          float dashAcross = 1.0 - smoothstep(0.12, 0.24, abs(materialInput.st.t - 0.5));
          float dash = dashAlong * dashAcross;
          float dotAlong = (localPosition - 0.5) / 0.32;
          float dotAcross = (materialInput.st.t - 0.5) / 0.5;
          float dot = 1.0 - smoothstep(0.78, 1.0, length(vec2(dotAlong, dotAcross)));
          float isDot = 1.0 - step(0.5, markIndex);
          float visible = mix(dash, dot, isDot);
          material.diffuse = color.rgb;
          material.emission = color.rgb * mix(0.07, 0.65, isDot);
          material.alpha = color.a * visible * mix(0.58, 1.0, isDot);
          return material;
        }`,
      },
    });
  } catch {
    // Space Missions may have already registered the same fabric type.
  }
  registered = true;
}

function tacticalColor(colorCss, alpha) {
  return Cesium.Color.fromCssColorString(colorCss).withAlpha(alpha);
}

/** Space Missions dash-dot material for PolylineCollection primitives. */
export function createTacticalOrbitMaterial(colorCss = TACTICAL_ORBIT_COLOR, alpha = 0.95) {
  ensureRegistered();
  const color = tacticalColor(colorCss, alpha);
  return Cesium.Material.fromType(MATERIAL_TYPE, {
    color,
    groupCount: TACTICAL_ORBIT_GROUPS,
    dashCount: TACTICAL_ORBIT_DASHES,
  });
}

/** Space Missions dash-dot material for entity polylines. */
export function createTacticalOrbitMaterialProperty(
  colorCss = TACTICAL_ORBIT_COLOR,
  alpha = 0.95,
) {
  ensureRegistered();
  const color = tacticalColor(colorCss, alpha);
  return {
    isConstant: true,
    definitionChanged: new Cesium.Event(),
    getType() {
      return MATERIAL_TYPE;
    },
    getValue(_time, result) {
      const out = result || {};
      out.color = color;
      out.groupCount = TACTICAL_ORBIT_GROUPS;
      out.dashCount = TACTICAL_ORBIT_DASHES;
      return out;
    },
    equals(other) {
      return this === other;
    },
  };
}
