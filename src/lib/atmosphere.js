import * as THREE from 'three';

/**
 * Atmospheric scattering for inverted Earth
 * Models a thin atmosphere shell clinging to the inner surface
 * Maximum haze at horizon angles, clearer for overhead distant terrain
 */

// Shader chunk for atmospheric scattering calculation
export const atmosphereShaderChunk = `
  // Atmosphere parameters (uniforms)
  uniform vec3 uAtmosphereColor;
  uniform float uAtmosphereThickness;  // km, thickness of atmosphere shell
  uniform float uAtmosphereDensity;    // scattering coefficient
  uniform float uGlobeRadius;          // km, radius of globe surface
  uniform vec3 uCameraPosition;        // camera world position
  uniform vec3 uSunDirection;          // normalized direction TO the sun

  // Calculate path length through atmospheric shell
  // Atmosphere is a shell from (globeRadius - thickness) to globeRadius
  float getAtmospherePathLength(vec3 rayOrigin, vec3 rayDir, float innerRadius, float outerRadius) {
    // Ray-sphere intersection for both inner and outer atmosphere bounds
    float a = dot(rayDir, rayDir);
    float b = 2.0 * dot(rayOrigin, rayDir);

    // Outer sphere (globe surface level)
    float cOuter = dot(rayOrigin, rayOrigin) - outerRadius * outerRadius;
    float discriminantOuter = b * b - 4.0 * a * cOuter;

    // Inner sphere (bottom of atmosphere)
    float cInner = dot(rayOrigin, rayOrigin) - innerRadius * innerRadius;
    float discriminantInner = b * b - 4.0 * a * cInner;

    float pathLength = 0.0;

    if (discriminantOuter >= 0.0) {
      float sqrtDiscOuter = sqrt(discriminantOuter);
      float t1Outer = (-b - sqrtDiscOuter) / (2.0 * a);
      float t2Outer = (-b + sqrtDiscOuter) / (2.0 * a);

      // We're inside the sphere, so we care about the positive intersection
      float tEnter = 0.0;  // Start from camera
      float tExit = max(t1Outer, t2Outer);

      if (discriminantInner >= 0.0) {
        // Ray also intersects inner sphere (atmosphere bottom)
        float sqrtDiscInner = sqrt(discriminantInner);
        float t1Inner = (-b - sqrtDiscInner) / (2.0 * a);
        float t2Inner = (-b + sqrtDiscInner) / (2.0 * a);

        // Path through atmosphere = path to outer - path through void
        float tInnerEnter = max(0.0, min(t1Inner, t2Inner));
        float tInnerExit = max(t1Inner, t2Inner);

        if (tInnerEnter > 0.0 && tInnerEnter < tExit) {
          // Ray exits atmosphere, goes through void, re-enters
          pathLength = tInnerEnter + (tExit - tInnerExit);
        } else {
          pathLength = tExit;
        }
      } else {
        // Ray stays within atmosphere shell entirely
        pathLength = tExit;
      }
    }

    return max(0.0, pathLength);
  }

  // Calculate day/night factor based on surface position and sun direction
  // Returns 1.0 for full day, 0.0 for full night, with smooth transition
  float getDayFactor(vec3 worldPos) {
    // Surface normal for inverted world (points outward from center)
    vec3 surfaceNormal = normalize(worldPos);

    // How much this point faces the sun
    // Positive = facing sun (day), Negative = facing away (night)
    float sunDot = dot(surfaceNormal, uSunDirection);

    // Smooth transition at terminator
    // -0.1 to 0.2 gives a nice gradient for the day/night boundary
    return smoothstep(-0.1, 0.2, sunDot);
  }

  // Apply atmospheric scattering to a color
  vec3 applyAtmosphere(vec3 color, vec3 worldPos) {
    vec3 rayDir = normalize(worldPos - uCameraPosition);

    float innerRadius = uGlobeRadius - uAtmosphereThickness;
    float outerRadius = uGlobeRadius;

    float pathLength = getAtmospherePathLength(uCameraPosition, rayDir, innerRadius, outerRadius);

    // Exponential falloff based on path through atmosphere
    float scatter = 1.0 - exp(-pathLength * uAtmosphereDensity);

    // Day/night factors for BOTH ends of the atmospheric path
    float localDayFactor = getDayFactor(uCameraPosition);   // Atmosphere near camera
    float remoteDayFactor = getDayFactor(worldPos);         // Atmosphere near target

    // Atmosphere scattering depends on sunlight at EITHER end of the path
    // If local atmosphere is sunlit, we get blue scatter even looking at night side
    // Average the two factors (could also use max for more aggressive effect)
    float combinedDayFactor = (localDayFactor + remoteDayFactor) * 0.5;

    // Atmosphere color shifts from blue (day) to dark (night)
    vec3 dayAtmoColor = uAtmosphereColor;
    vec3 nightAtmoColor = vec3(0.02, 0.02, 0.05); // Very dark blue-ish
    vec3 scatterColor = mix(nightAtmoColor, dayAtmoColor, combinedDayFactor);

    // Blend original color with atmosphere
    return mix(color, scatterColor, scatter);
  }
`;

// Custom shader material that includes atmospheric scattering
export function createAtmosphericMaterial(baseTexture, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: baseTexture },
      ...uniforms
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      ${atmosphereShaderChunk}

      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vec4 texColor = texture2D(map, vUv);
        vec3 finalColor = applyAtmosphere(texColor.rgb, vWorldPosition);
        gl_FragColor = vec4(finalColor, texColor.a);
      }
    `,
    side: THREE.DoubleSide,
  });
}

/**
 * Creates atmosphere controller and provides uniforms for shaders
 */
export function createAtmosphere(scene, earthRadius) {
  // Sky color for background (looking into the void)
  const skyColor = new THREE.Color(0x1a1a2e); // Dark blue-ish void
  scene.background = skyColor;

  // Disable built-in fog - we're using shader-based scattering
  scene.fog = null;

  // Shared uniforms for all atmospheric materials
  const uniforms = {
    uAtmosphereColor: { value: new THREE.Color(0x88bbdd) },
    uAtmosphereThickness: { value: 50.0 },   // 50km atmosphere (thinner shell)
    uAtmosphereDensity: { value: 0.004 },    // lower density for subtler effect
    uGlobeRadius: { value: earthRadius },
    uCameraPosition: { value: new THREE.Vector3() },
    uSunDirection: { value: new THREE.Vector3(1, 0, 0) } // Default: sun in +X direction
  };

  return {
    uniforms,

    // Call this each frame to update camera position
    update(camera) {
      uniforms.uCameraPosition.value.copy(camera.position);
    },

    setDensity(density) {
      uniforms.uAtmosphereDensity.value = density;
    },

    setThickness(thickness) {
      uniforms.uAtmosphereThickness.value = thickness;
    },

    setColor(color) {
      uniforms.uAtmosphereColor.value.set(color);
    },

    // Set sun position from lat/lon (where the sun is directly overhead)
    setSunPosition(lat, lon) {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = -lon * Math.PI / 180;

      // Direction FROM center TO sun position on sphere
      const x = Math.sin(phi) * Math.sin(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.cos(theta);

      uniforms.uSunDirection.value.set(x, y, z).normalize();
    },

    // Set sun direction directly (normalized vec3)
    setSunDirection(x, y, z) {
      uniforms.uSunDirection.value.set(x, y, z).normalize();
    },

    // Presets
    clear() {
      this.setDensity(0.002);
      this.setThickness(30);
    },

    normal() {
      this.setDensity(0.004);
      this.setThickness(50);
    },

    hazy() {
      this.setDensity(0.008);
      this.setThickness(80);
    }
  };
}
