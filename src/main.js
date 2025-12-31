import * as THREE from 'three';
import { createGlobe } from './lib/globe.js';
import { createTerrain } from './lib/terrain.js';
import { setupControls } from './lib/controls.js';
import { createAtmosphere } from './lib/atmosphere.js';
import { createCameraAnimation, KEYFRAMES, applyKeyframe } from './lib/cameraAnimation.js';

// Configuration
const CONFIG = {
  // Cape Otway Lighthouse, Victoria, Australia
  location: {
    lat: -38.8539766,
    lon: 143.5105863,
  },
  earthRadius: 6371, // km, 1 unit = 1 km
  // LOD terrain system handles radius automatically
};

// Scene setup
const scene = new THREE.Scene();
// Background color set by atmosphere.js

// Camera
const camera = new THREE.PerspectiveCamera(
  60, // Standard FOV, similar to human vision
  window.innerWidth / window.innerHeight,
  0.001, // Near plane: 1 meter
  20000  // Far plane: 20,000 km
);

// Position camera ON the sphere at Australia
const { lat, lon } = CONFIG.location;
const phi = (90 - lat) * (Math.PI / 180);
// Texture flip + globe rotation cancel out the offset, just negate lon
const theta = -lon * Math.PI / 180;

// Camera position inside sphere - 10km inside (2km above terrain at 8km offset)
const cameraPos = new THREE.Vector3();
cameraPos.setFromSphericalCoords(CONFIG.earthRadius - 10, phi, theta); // 10km inside sphere
camera.position.copy(cameraPos);

// Up vector points toward center (inverted gravity)
const up = cameraPos.clone().negate().normalize();
camera.up.copy(up);

// Look forward (north) - tangent to sphere
const north = new THREE.Vector3(0, 1, 0);
const east = up.clone().cross(north).normalize();
const forward = east.clone().cross(up).normalize(); // Local north
const lookTarget = cameraPos.clone().add(forward.multiplyScalar(1000));
camera.lookAt(lookTarget);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lighting - bright ambient for consistent terrain illumination
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight);

// Initialize scene components
async function init() {
  try {
    // Setup atmosphere FIRST to get uniforms for shaders
    const atmosphere = createAtmosphere(scene, CONFIG.earthRadius);

    // Set sun position: over Pacific so Australia is in daylight, Asia at night
    // Sun at roughly -20° lat, -150° lon (south Pacific, west of South America)
    atmosphere.setSunPosition(-20, -150);

    // Create the inverted globe with atmospheric scattering
    const globe = await createGlobe(CONFIG.earthRadius, false, atmosphere.uniforms);
    scene.add(globe);

    // Create LOD terrain with atmospheric scattering
    const terrain = await createTerrain(CONFIG.location, atmosphere.uniforms);
    scene.add(terrain);
    console.log('Terrain children:', terrain.children.length, terrain.children.map(c => c.name));

    // Setup camera controls (mouselook + WASD)
    const controls = setupControls(camera, renderer.domElement);

    // Setup camera animation system
    const cameraAnim = createCameraAnimation(camera);

    // Keyboard shortcuts for keyframes and animation
    document.addEventListener('keydown', (event) => {
      // Number keys 1-7 jump to keyframes
      const keyNum = parseInt(event.key);
      if (keyNum >= 1 && keyNum <= 7) {
        cameraAnim.goToKeyframe(keyNum - 1);
        updateInfo();
      }

      // Space toggles animation
      if (event.code === 'Space') {
        event.preventDefault();
        cameraAnim.toggleAnimation();
        updateInfo();
      }

      // R resets to beginning
      if (event.code === 'KeyR' && !event.ctrlKey) {
        cameraAnim.reset();
        updateInfo();
      }
    });

    function updateInfo() {
      const info = document.getElementById('info');
      if (info) {
        if (cameraAnim.isAnimating) {
          info.textContent = 'SPACE: pause | R: reset | 1-7: jump to keyframe';
        } else {
          info.textContent = 'SPACE: play animation | 1-7: keyframes | WASD/Q/E: manual control';
        }
      }
    }
    updateInfo();

    // Hide loading screen
    document.getElementById('loading').style.display = 'none';

    // For animation timing
    let lastTime = performance.now();

    // Render loop
    function animate() {
      requestAnimationFrame(animate);

      const now = performance.now();
      const deltaTime = (now - lastTime) / 1000; // Convert to seconds
      lastTime = now;

      // Update camera animation if playing
      if (cameraAnim.isAnimating) {
        cameraAnim.update(deltaTime);
      } else {
        // Manual controls only when not animating
        controls.update();
      }

      // Update atmosphere with current camera position
      atmosphere.update(camera);

      renderer.render(scene, camera);
    }
    animate();

  } catch (error) {
    console.error('Failed to initialize:', error);
    document.getElementById('loading').textContent = 'Failed to load: ' + error.message;
  }
}

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
