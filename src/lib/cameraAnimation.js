import * as THREE from 'three';

/**
 * Camera animation system for inverted Earth flythrough
 * Keyframes define position (lat, lon, altitude) and look direction
 */

const EARTH_RADIUS = 6371;

/**
 * Convert lat/lon/altitude to camera position and up vector
 */
function latLonAltToPosition(lat, lon, altitude) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = -lon * Math.PI / 180;
  const radius = EARTH_RADIUS - altitude;

  const position = new THREE.Vector3();
  position.setFromSphericalCoords(radius, phi, theta);

  // Up vector points toward center (inverted gravity)
  const up = position.clone().negate().normalize();

  return { position, up };
}

/**
 * Calculate look target from a target lat/lon
 * Returns the position on the globe surface at that lat/lon
 */
function getLookTargetFromLatLon(targetLat, targetLon) {
  const phi = (90 - targetLat) * (Math.PI / 180);
  const theta = -targetLon * Math.PI / 180;

  // Target is on the globe surface
  const target = new THREE.Vector3();
  target.setFromSphericalCoords(EARTH_RADIUS, phi, theta);
  return target;
}

/**
 * Keyframes for the camera animation
 * Each keyframe has:
 *   - lat, lon: camera position on globe
 *   - altitude: km offset from globe surface (terrain is at 8km offset)
 *   - lookAtLat, lookAtLon: target location to look at on the globe
 *   - duration: time to reach this keyframe from previous (seconds)
 */
export const KEYFRAMES = [
  {
    name: "1: Start - Low over Australia",
    lat: -38.85,
    lon: 143.51,
    altitude: 10,
    lookAtLat: -30,      // Looking north into Australia
    lookAtLon: 143.51,
    duration: 0
  },
  {
    name: "2: Rising - Gaining altitude",
    lat: -38.85,
    lon: 143.51,
    altitude: 40,
    lookAtLat: -20,      // Looking further north
    lookAtLon: 140,
    duration: 8
  },
  {
    name: "3: High - Looking at Asia",
    lat: -38.85,
    lon: 143.51,
    altitude: 90,
    lookAtLat: 20,       // Southeast Asia
    lookAtLon: 110,
    duration: 6
  },
  {
    name: "4: Americas - North",
    lat: -35,
    lon: 145,
    altitude: 80,
    lookAtLat: 35,       // North America (around California)
    lookAtLon: -120,
    duration: 5
  },
  {
    name: "5: Americas - South",
    lat: -35,
    lon: 150,
    altitude: 80,
    lookAtLat: -15,      // South America (Brazil)
    lookAtLon: -60,
    duration: 8
  },
  {
    name: "6: Antarctica view",
    lat: -40,
    lon: 155,
    altitude: 50,
    lookAtLat: -80,      // Antarctica
    lookAtLon: 150,
    duration: 6
  },
  {
    name: "7: Return - Descending",
    lat: -38.85,
    lon: 143.51,
    altitude: 10,
    lookAtLat: -30,      // Back to looking north
    lookAtLon: 143.51,
    duration: 10
  }
];

/**
 * Apply a keyframe to the camera
 */
export function applyKeyframe(camera, keyframeIndex) {
  const kf = KEYFRAMES[keyframeIndex];
  const { position, up } = latLonAltToPosition(kf.lat, kf.lon, kf.altitude);
  const lookTarget = getLookTargetFromLatLon(kf.lookAtLat, kf.lookAtLon);

  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(lookTarget);

  console.log(`Applied keyframe ${keyframeIndex + 1}: ${kf.name}`);
  return kf;
}

/**
 * Get total duration of one animation cycle
 */
export function getTotalDuration() {
  return KEYFRAMES.reduce((sum, kf) => sum + kf.duration, 0);
}

/**
 * Create camera animation controller
 */
export function createCameraAnimation(camera) {
  let currentKeyframe = 0;
  let isAnimating = false;
  let animationTime = 0;
  let animationProgress = 0;
  let onCycleComplete = null;

  // For interpolation
  const startPos = new THREE.Vector3();
  const endPos = new THREE.Vector3();
  const startUp = new THREE.Vector3();
  const endUp = new THREE.Vector3();
  const startLook = new THREE.Vector3();
  const endLook = new THREE.Vector3();
  const startQuat = new THREE.Quaternion();
  const endQuat = new THREE.Quaternion();

  return {
    // Jump directly to a keyframe (for testing)
    goToKeyframe(index) {
      if (index >= 0 && index < KEYFRAMES.length) {
        currentKeyframe = index;
        isAnimating = false;
        return applyKeyframe(camera, index);
      }
    },

    // Start/stop animation
    toggleAnimation() {
      isAnimating = !isAnimating;
      if (isAnimating) {
        animationTime = 0;
        animationProgress = 0;
        console.log('Animation started');
      } else {
        console.log('Animation paused');
      }
      return isAnimating;
    },

    // Reset to beginning
    reset() {
      currentKeyframe = 0;
      isAnimating = false;
      animationTime = 0;
      applyKeyframe(camera, 0);
    },

    // Update animation (call each frame with delta time in seconds)
    update(deltaTime) {
      if (!isAnimating) return;

      animationTime += deltaTime;

      // Find which keyframe segment we're in
      let totalTime = 0;
      let segmentStart = 0;
      let segmentIndex = 0;

      for (let i = 1; i < KEYFRAMES.length; i++) {
        const segmentDuration = KEYFRAMES[i].duration;
        if (animationTime < totalTime + segmentDuration) {
          segmentIndex = i - 1;
          segmentStart = totalTime;
          break;
        }
        totalTime += segmentDuration;
        segmentIndex = i;
      }

      // Check if animation complete (loop)
      const totalDuration = KEYFRAMES.reduce((sum, kf) => sum + kf.duration, 0);
      if (animationTime >= totalDuration) {
        // Fire callback before resetting
        if (onCycleComplete) {
          onCycleComplete();
          onCycleComplete = null; // Only fire once
        }
        animationTime = 0;
        segmentIndex = 0;
        segmentStart = 0;
      }

      // Interpolate between keyframes
      const fromKf = KEYFRAMES[segmentIndex];
      const toKf = KEYFRAMES[(segmentIndex + 1) % KEYFRAMES.length];
      const segmentDuration = toKf.duration || 1;
      const t = Math.min(1, (animationTime - segmentStart) / segmentDuration);

      // Smooth easing
      const eased = smoothstep(t);

      // Interpolate position
      const from = latLonAltToPosition(fromKf.lat, fromKf.lon, fromKf.altitude);
      const to = latLonAltToPosition(toKf.lat, toKf.lon, toKf.altitude);

      camera.position.lerpVectors(from.position, to.position, eased);

      // Interpolate up vector
      const up = new THREE.Vector3().lerpVectors(from.up, to.up, eased).normalize();
      camera.up.copy(up);

      // Interpolate look target position
      const fromLook = getLookTargetFromLatLon(fromKf.lookAtLat, fromKf.lookAtLon);
      const toLook = getLookTargetFromLatLon(toKf.lookAtLat, toKf.lookAtLon);
      const lookTarget = new THREE.Vector3().lerpVectors(fromLook, toLook, eased);

      // Apply look at
      camera.lookAt(lookTarget);
    },

    get isAnimating() { return isAnimating; },
    get currentKeyframe() { return currentKeyframe; },

    // Set callback for when animation completes one cycle
    setOnCycleComplete(callback) {
      onCycleComplete = callback;
    }
  };
}

// Smooth easing function
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}
