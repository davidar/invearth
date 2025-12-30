import * as THREE from 'three';

/**
 * Creates atmospheric haze effect using fog
 * Tuned so local terrain is crisp, distant continents are hazy
 */
export function createAtmosphere(scene, earthRadius) {
  // Use exponential fog for more natural falloff
  // Dense enough to fade distant objects but not obscure them completely

  // Fog color - slightly blue/white atmospheric haze
  const fogColor = new THREE.Color(0xb0c4de); // Light steel blue

  // Exponential fog: density determines falloff rate
  // Lower density = more gradual fade
  // At density 0.0001, objects at 1000km are ~90% visible
  // At density 0.00005, objects at 5000km are still ~78% visible
  // Much lower density for Earth-scale distances
  // At 0.000005, objects at 12000km (antipodal) are ~94% visible
  const fog = new THREE.FogExp2(fogColor, 0.000005);

  scene.fog = fog;
  scene.background = fogColor;

  return {
    setDensity(density) {
      fog.density = density;
    },

    setColor(color) {
      fog.color.set(color);
      scene.background = fog.color;
    },

    // Presets
    clear() {
      fog.density = 0.00001;
    },

    hazy() {
      fog.density = 0.00005;
    },

    dense() {
      fog.density = 0.0001;
    }
  };
}
