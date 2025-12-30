import * as THREE from 'three';

/**
 * Click-and-drag mouselook controls for inverted sphere
 * Works without pointer lock (Flatpak compatible)
 */
export function setupControls(camera, domElement) {
  let isDragging = false;
  let prevX = 0;
  let prevY = 0;

  // Track cumulative pitch to clamp it
  let pitch = 0;
  const maxPitch = Math.PI / 2 - 0.01;

  // Sensitivity
  const sensitivity = 0.003;

  // Store the "up" direction (toward sphere center, set by main.js)
  const upVector = camera.up.clone();

  // Temp quaternions for rotation
  const yawQuat = new THREE.Quaternion();
  const pitchQuat = new THREE.Quaternion();
  const rightVector = new THREE.Vector3();

  function onMouseDown(event) {
    if (event.button === 0) { // Left click
      isDragging = true;
      prevX = event.clientX;
      prevY = event.clientY;
      domElement.style.cursor = 'grabbing';
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) {
      isDragging = false;
      domElement.style.cursor = 'grab';
    }
  }

  function onMouseMove(event) {
    if (!isDragging) return;

    const movementX = event.clientX - prevX;
    const movementY = event.clientY - prevY;
    prevX = event.clientX;
    prevY = event.clientY;

    // Yaw: rotate around the up vector (toward center)
    yawQuat.setFromAxisAngle(upVector, movementX * sensitivity);
    camera.quaternion.premultiply(yawQuat);

    // Calculate new pitch and clamp it
    const newPitch = pitch + movementY * sensitivity;
    if (Math.abs(newPitch) < maxPitch) {
      pitch = newPitch;

      // Get camera's right vector for pitch rotation
      rightVector.set(1, 0, 0).applyQuaternion(camera.quaternion);

      // Pitch: rotate around the right vector
      pitchQuat.setFromAxisAngle(rightVector, movementY * sensitivity);
      camera.quaternion.premultiply(pitchQuat);
    }

    // Keep camera up vector consistent
    camera.up.copy(upVector);
  }

  function onMouseLeave() {
    isDragging = false;
    domElement.style.cursor = 'grab';
  }

  // Set initial cursor
  domElement.style.cursor = 'grab';

  // Set up event listeners
  domElement.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('mouseleave', onMouseLeave);

  // Update info text
  const info = document.getElementById('info');
  if (info) {
    info.textContent = 'Click and drag to look around';
  }

  return {
    update() {
      // No continuous update needed
    },

    dispose() {
      domElement.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      domElement.removeEventListener('mouseleave', onMouseLeave);
    },

    get isDragging() {
      return isDragging;
    }
  };
}
