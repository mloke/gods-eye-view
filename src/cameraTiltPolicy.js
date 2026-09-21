import { isSolarSystemRegimeActive } from './solarSystem/sceneRegime.js';

export const ANGLED_VIEW_STORAGE_KEY = 'gev:angled-view:v1';
export const NADIR_PITCH_DEG = -89;

/** Read the persisted allow-angled-view switch. Missing or unreadable is off. */
export function readStoredAngledViewAllowed(
  storage = globalThis.localStorage,
) {
  try {
    return storage?.getItem?.(ANGLED_VIEW_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the operator has turned the angled-view allow switch on. */
export function isAngledViewAllowed(storage = globalThis.localStorage) {
  return readStoredAngledViewAllowed(storage);
}

/** Persist the allow switch. Returns the stored value. */
export function setAngledViewAllowed(
  next,
  { persist = true, storage = globalThis.localStorage } = {},
) {
  const allowed = !!next;
  if (persist) {
    try {
      storage?.setItem?.(ANGLED_VIEW_STORAGE_KEY, allowed ? '1' : '0');
    } catch {
      /* browser storage can be blocked */
    }
  }
  return allowed;
}

/**
 * Fly-to and restore pitches stay nadir until angled view is allowed.
 * @param {number} requestedDeg
 * @returns {number}
 */
export function resolveCameraPitchDeg(
  requestedDeg,
  storage = globalThis.localStorage,
) {
  const requested = Number(requestedDeg);
  if (isAngledViewAllowed(storage) && Number.isFinite(requested))
    return requested;
  return NADIR_PITCH_DEG;
}

/** Mouse/trackball tilt follows the allow switch. */
export function applyAngledViewController(viewer, allowed) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  if (!controller) return;
  // Solar System owns tilt so the operator can orbit a look-at pivot.
  if (isSolarSystemRegimeActive()) {
    controller.enableTilt = true;
    return;
  }
  controller.enableTilt = !!allowed;
}
