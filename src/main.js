import * as THREE from 'three';
import { createGlobe } from './lib/globe.js';
import { createTerrain } from './lib/terrain.js';
import { setupControls } from './lib/controls.js';
import { createAtmosphere } from './lib/atmosphere.js';

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
scene.background = new THREE.Color(0x87ceeb); // Sky blue for now

// Camera
const camera = new THREE.PerspectiveCamera(
  90, // Moderate wide angle
  window.innerWidth / window.innerHeight,
  0.001, // Near plane: 1 meter
  20000  // Far plane: 20,000 km
);

// Position camera ON the sphere at Australia
const { lat, lon } = CONFIG.location;
const phi = (90 - lat) * (Math.PI / 180);
// Texture flip + globe rotation cancel out the offset, just negate lon
const theta = -lon * Math.PI / 180;

// Camera position inside sphere - 50km inside for elevated view
const cameraPos = new THREE.Vector3();
cameraPos.setFromSphericalCoords(CONFIG.earthRadius - 50, phi, theta); // 50km inside sphere
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
    // Create the inverted globe (false = no debug overlay)
    const globe = await createGlobe(CONFIG.earthRadius, false);
    scene.add(globe);

    // Create LOD terrain from Mapbox
    const terrain = await createTerrain(CONFIG.location);
    scene.add(terrain);
    console.log('Terrain children:', terrain.children.length, terrain.children.map(c => c.name));

    // DEBUG test sphere removed - no longer needed

    // Setup atmosphere/fog
    const atmosphere = createAtmosphere(scene, CONFIG.earthRadius);

    // Setup camera controls (mouselook only)
    const controls = setupControls(camera, renderer.domElement);

    // Hide loading screen
    document.getElementById('loading').style.display = 'none';

    // Render loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
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
