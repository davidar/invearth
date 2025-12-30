import * as THREE from 'three';

/**
 * Custom mouselook controls - camera rotates but doesn't move
 * Works with inverted "up" direction
 */
export function setupControls(camera, domElement) {
  let isLocked = false;

  // Store initial camera orientation
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const PI_2 = Math.PI / 2;

  // Sensitivity
  const sensitivity = 0.002;

  // Get initial orientation from camera
  euler.setFromQuaternion(camera.quaternion);

  function onMouseMove(event) {
    if (!isLocked) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    // Yaw (left/right) - rotate around the "up" axis (toward center)
    euler.y -= movementX * sensitivity;

    // Pitch (up/down) - limited to prevent flipping
    euler.x -= movementY * sensitivity;
    euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));

    camera.quaternion.setFromEuler(euler);
  }

  function onPointerLockChange() {
    isLocked = document.pointerLockElement === domElement;

    const info = document.getElementById('info');
    if (info) {
      info.textContent = isLocked ? 'ESC to release mouse' : 'Click to look around';
    }
  }

  function onClick() {
    domElement.requestPointerLock();
  }

  // Set up event listeners
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  domElement.addEventListener('click', onClick);

  return {
    update() {
      // No continuous update needed for mouselook
    },

    dispose() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      domElement.removeEventListener('click', onClick);
    },

    get isLocked() {
      return isLocked;
    }
  };
}
