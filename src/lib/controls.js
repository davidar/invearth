import * as THREE from 'three';

/**
 * Click-and-drag mouselook + WASD movement controls for inverted sphere
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

  // Movement settings
  const moveSpeed = 0.1; // km per frame at 60fps
  const altitudeSpeed = 0.05; // km per frame

  // Track camera's current radius (altitude)
  let cameraRadius = camera.position.length();

  // Store the "up" direction (toward sphere center, set by main.js)
  const upVector = camera.up.clone();

  // Track pressed keys
  const keys = {
    forward: false,  // W
    backward: false, // S
    left: false,     // A
    right: false,    // D
    up: false,       // Q
    down: false,     // E
  };

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

  function onKeyDown(event) {
    switch (event.code) {
      case 'KeyW': keys.forward = true; break;
      case 'KeyS': keys.backward = true; break;
      case 'KeyA': keys.left = true; break;
      case 'KeyD': keys.right = true; break;
      case 'KeyQ': keys.up = true; break;
      case 'KeyE': keys.down = true; break;
    }
  }

  function onKeyUp(event) {
    switch (event.code) {
      case 'KeyW': keys.forward = false; break;
      case 'KeyS': keys.backward = false; break;
      case 'KeyA': keys.left = false; break;
      case 'KeyD': keys.right = false; break;
      case 'KeyQ': keys.up = false; break;
      case 'KeyE': keys.down = false; break;
    }
  }

  // Set initial cursor
  domElement.style.cursor = 'grab';

  // Set up event listeners
  domElement.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Update info text
  const info = document.getElementById('info');
  if (info) {
    info.textContent = 'WASD to move, Q/E for altitude, drag to look';
  }

  // Temp vectors for movement calculations
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  return {
    update() {
      // Check if any movement keys are pressed
      const isMoving = keys.forward || keys.backward || keys.left || keys.right || keys.up || keys.down;
      if (!isMoving) return;

      // Get camera's forward direction (where it's looking)
      camera.getWorldDirection(forward);

      // Get current up vector (toward center from current position)
      upVector.copy(camera.position).normalize().negate();

      // Project forward onto the tangent plane (remove component toward center)
      // This gives us "forward along the sphere surface"
      const forwardDotUp = forward.dot(upVector);
      forward.addScaledVector(upVector, -forwardDotUp).normalize();

      // Right is perpendicular to both up and forward
      right.crossVectors(forward, upVector).normalize();

      // Calculate movement delta
      const delta = new THREE.Vector3();

      if (keys.forward) delta.addScaledVector(forward, moveSpeed);
      if (keys.backward) delta.addScaledVector(forward, -moveSpeed);
      if (keys.right) delta.addScaledVector(right, moveSpeed);
      if (keys.left) delta.addScaledVector(right, -moveSpeed);

      // Apply horizontal movement
      camera.position.add(delta);

      // Handle altitude changes (in inverted world: smaller radius = higher altitude)
      if (keys.up) cameraRadius -= altitudeSpeed;   // Up = smaller radius = toward center
      if (keys.down) cameraRadius += altitudeSpeed; // Down = larger radius = away from center

      // Clamp altitude (between 1km and 100km from surface)
      // Globe is at 6371, terrain at 6363, so reasonable range is ~6260-6370
      const minRadius = 6371 - 100; // 100km altitude
      const maxRadius = 6371 - 1;   // 1km altitude
      cameraRadius = Math.max(minRadius, Math.min(maxRadius, cameraRadius));

      // Normalize position to maintain current radius (altitude)
      camera.position.normalize().multiplyScalar(cameraRadius);

      // Recalculate up vector for new position
      upVector.copy(camera.position).normalize().negate();
      camera.up.copy(upVector);

      // Recalculate camera orientation to stay "level"
      // Keep looking in roughly the same direction but adjust for new up
      camera.getWorldDirection(forward);
      const newForwardDotUp = forward.dot(upVector);
      forward.addScaledVector(upVector, -newForwardDotUp).normalize();

      // Create look target
      const lookTarget = camera.position.clone().add(forward);
      camera.lookAt(lookTarget);
      camera.up.copy(upVector);
    },

    dispose() {
      domElement.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      domElement.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    },

    get isDragging() {
      return isDragging;
    }
  };
}
