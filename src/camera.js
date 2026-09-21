import * as Cesium from 'cesium';
import { resolveCameraPitchDeg } from './cameraTiltPolicy.js';

/** Default cold-start camera: Petco Park, San Diego. */
export const STARTUP_VIEW = Object.freeze({
  lon: -117.1566,
  lat: 32.7073,
  overviewHeightM: 25000,
  arrivalHeightM: 800,
  headingDeg: 10,
  pitchDeg: -30,
});

/**
 * Camera presets for notable locations.
 * Default startup uses Petco Park via flyToStartupLocation.
 */
export const CAMERA_PRESETS = {
  petco: {
    destination: Cesium.Cartesian3.fromDegrees(
      STARTUP_VIEW.lon,
      STARTUP_VIEW.lat,
      STARTUP_VIEW.arrivalHeightM,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(STARTUP_VIEW.headingDeg),
      pitch: Cesium.Math.toRadians(STARTUP_VIEW.pitchDeg),
      roll: 0.0,
    },
  },
  austin: {
    destination: Cesium.Cartesian3.fromDegrees(-97.7431, 30.2672, 800),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-35),
      roll: 0.0,
    },
  },
  sf: {
    destination: Cesium.Cartesian3.fromDegrees(-122.4194, 37.7749, 1000),
    orientation: {
      heading: Cesium.Math.toRadians(30),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
  nyc: {
    destination: Cesium.Cartesian3.fromDegrees(-73.9857, 40.7484, 1200),
    orientation: {
      heading: Cesium.Math.toRadians(-20),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0.0,
    },
  },
};

/**
 * Fly the camera to a preset location with a smooth animation.
 */
export function flyToPreset(viewer, presetName, duration = 3.0) {
  const preset = CAMERA_PRESETS[presetName];
  if (!preset) return;

  viewer.camera.flyTo({
    destination: preset.destination,
    orientation: preset.orientation,
    duration,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });
}

/**
 * Set the camera over Petco Park on load with a cinematic fly-in.
 * @returns {Function} Cancels the pending or active startup flight.
 */
export function flyToStartupLocation(viewer) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      STARTUP_VIEW.lon,
      STARTUP_VIEW.lat,
      STARTUP_VIEW.overviewHeightM,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-90),
      roll: 0.0,
    },
  });

  const timer = setTimeout(() => {
    if (viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        STARTUP_VIEW.lon,
        STARTUP_VIEW.lat,
        STARTUP_VIEW.arrivalHeightM,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(STARTUP_VIEW.headingDeg),
        pitch: Cesium.Math.toRadians(
          resolveCameraPitchDeg(STARTUP_VIEW.pitchDeg),
        ),
        roll: 0.0,
      },
      duration: 4.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }, 500);
  return () => {
    clearTimeout(timer);
    if (!viewer.isDestroyed()) viewer.camera.cancelFlight();
  };
}

/** @deprecated Use flyToStartupLocation. */
export function flyToAustin(viewer) {
  return flyToStartupLocation(viewer);
}
