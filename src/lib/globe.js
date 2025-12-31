import * as THREE from 'three';
import { atmosphereShaderChunk } from './atmosphere.js';

// Mapbox API configuration
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/**
 * Create globe texture from Mapbox satellite tiles
 * Fetches low-zoom tiles and composites them into an equirectangular texture
 */
async function createMapboxGlobeTexture() {
  const zoom = 3; // 8x8 = 64 tiles, good balance of coverage and quality
  const tileSize = 256;
  const numTiles = Math.pow(2, zoom);

  const width = numTiles * tileSize;
  const height = numTiles * tileSize;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fill with ocean blue as fallback
  ctx.fillStyle = '#1a4a6e';
  ctx.fillRect(0, 0, width, height);

  // Fetch all tiles
  const tilePromises = [];
  for (let y = 0; y < numTiles; y++) {
    for (let x = 0; x < numTiles; x++) {
      const url = `https://api.mapbox.com/v4/mapbox.satellite/${zoom}/${x}/${y}.jpg?access_token=${MAPBOX_TOKEN}`;
      tilePromises.push(
        loadImage(url)
          .then(img => ({ x, y, img }))
          .catch(() => ({ x, y, img: null }))
      );
    }
  }

  const tiles = await Promise.all(tilePromises);

  // Draw tiles to canvas (Web Mercator projection)
  for (const tile of tiles) {
    if (tile.img) {
      ctx.drawImage(tile.img, tile.x * tileSize, tile.y * tileSize, tileSize, tileSize);
    }
  }

  // Now we need to convert from Web Mercator to Equirectangular
  // Create a new canvas for the equirectangular output
  const eqWidth = 4096;
  const eqHeight = 2048;
  const eqCanvas = document.createElement('canvas');
  eqCanvas.width = eqWidth;
  eqCanvas.height = eqHeight;
  const eqCtx = eqCanvas.getContext('2d');

  // Fill with ocean blue
  eqCtx.fillStyle = '#1a4a6e';
  eqCtx.fillRect(0, 0, eqWidth, eqHeight);

  // Get source image data
  const srcData = ctx.getImageData(0, 0, width, height);
  const dstData = eqCtx.createImageData(eqWidth, eqHeight);

  // Convert Web Mercator to Equirectangular
  for (let dstY = 0; dstY < eqHeight; dstY++) {
    // Equirectangular latitude (-90 to 90)
    const lat = 90 - (dstY / eqHeight) * 180;

    // Convert to Web Mercator y
    const latRad = lat * Math.PI / 180;
    const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    // Normalize to 0-1 range (Mercator goes from -PI to PI for valid latitudes)
    const normalizedMercY = (1 - mercY / Math.PI) / 2;

    // Skip if outside Mercator bounds (~85°)
    if (normalizedMercY < 0 || normalizedMercY > 1) continue;

    const srcY = Math.floor(normalizedMercY * height);
    if (srcY < 0 || srcY >= height) continue;

    for (let dstX = 0; dstX < eqWidth; dstX++) {
      // Longitude maps directly (both are linear in X)
      const srcX = Math.floor((dstX / eqWidth) * width);

      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (dstY * eqWidth + dstX) * 4;

      dstData.data[dstIdx] = srcData.data[srcIdx];
      dstData.data[dstIdx + 1] = srcData.data[srcIdx + 1];
      dstData.data[dstIdx + 2] = srcData.data[srcIdx + 2];
      dstData.data[dstIdx + 3] = 255;
    }
  }

  eqCtx.putImageData(dstData, 0, 0);

  const texture = new THREE.CanvasTexture(eqCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Load an image
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function createGridTexture(width = 2048, height = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Flip horizontally to compensate for BackSide rendering
  ctx.translate(width, 0);
  ctx.scale(-1, 1);

  // Background - ocean blue
  ctx.fillStyle = '#1a4a6e';
  ctx.fillRect(0, 0, width, height);

  // Grid lines
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;

  // Latitude lines (every 30°)
  for (let lat = -90; lat <= 90; lat += 30) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.fillText(`${lat}°`, 10, y - 5);
  }

  // Longitude lines (every 30°)
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.fillText(`${lon}°`, x + 5, height / 2);
  }

  // Special markers
  // Red dot at 0°N, 0°E (Gulf of Guinea)
  ctx.fillStyle = '#ff0000';
  const zeroX = (180 / 360) * width;
  const zeroY = (90 / 180) * height;
  ctx.beginPath();
  ctx.arc(zeroX, zeroY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('0,0', zeroX + 25, zeroY + 5);

  // Green dot at Australia (-38°, 143°)
  ctx.fillStyle = '#00ff00';
  const ausX = ((143 + 180) / 360) * width;
  const ausY = ((90 + 38) / 180) * height;
  ctx.beginPath();
  ctx.arc(ausX, ausY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText('AUS', ausX + 25, ausY + 5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates an inverted Earth sphere - we're on the inside looking in
 * @param {number} radius - Earth radius in km
 * @param {boolean} useDebugTexture - Use debug grid texture
 * @param {Object} atmosphereUniforms - Atmosphere uniforms for shader
 */
export async function createGlobe(radius, useDebugTexture = false, atmosphereUniforms = null) {
  // High segment count for smooth sphere at this scale
  const geometry = new THREE.SphereGeometry(radius, 128, 64);

  let material;
  let texture;

  try {
    // Use Mapbox satellite tiles for consistency with terrain
    console.log('Loading Mapbox globe texture...');
    texture = await createMapboxGlobeTexture();

    // Flip texture horizontally for BackSide rendering
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;
    console.log('Mapbox globe texture loaded');
  } catch (error) {
    console.warn('Failed to load Mapbox globe texture, using grid fallback', error);
    texture = createGridTexture();
  }

  if (atmosphereUniforms) {
    // Use atmospheric scattering shader
    material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        ...atmosphereUniforms
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
          vUv = uv;
          // Flip U coordinate for BackSide rendering
          vUv.x = 1.0 - vUv.x;
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
      side: THREE.BackSide,
    });
  } else {
    material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
    });
  }

  const globe = new THREE.Mesh(geometry, material);
  globe.name = 'globe';

  // Rotate so lon=0° aligns with +Z axis
  globe.rotation.y = -Math.PI / 2;

  return globe;
}

/**
 * Future: Add heightmap displacement to the globe
 */
export function addGlobeDisplacement(globe, heightmapUrl, displacementScale = 10) {
  const textureLoader = new THREE.TextureLoader();

  textureLoader.load(heightmapUrl, (heightmap) => {
    globe.material.displacementMap = heightmap;
    globe.material.displacementScale = displacementScale;
    globe.material.needsUpdate = true;
  });
}
