import * as THREE from 'three';

/**
 * Create a debug lat/lon grid texture
 */
/**
 * Create combined texture with Blue Marble + debug overlay
 */
function createCombinedTexture(blueMarbleImg, showDebug = true) {
  const width = 4096;
  const height = 2048;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw Blue Marble as base (normal orientation - we flip the texture later)
  ctx.drawImage(blueMarbleImg, 0, 0, width, height);

  if (showDebug) {
    // Semi-transparent overlay
    ctx.globalAlpha = 0.7;

    // Grid lines
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 3;

    // Latitude lines (every 30°)
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = ((90 - lat) / 180) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Longitude lines (every 30°)
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;

    // Red marker at 0°N, 0°E
    ctx.fillStyle = '#ff0000';
    const zeroX = (180 / 360) * width;
    const zeroY = (90 / 180) * height;
    ctx.beginPath();
    ctx.arc(zeroX, zeroY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Green marker at Australia (-38°, 143°)
    ctx.fillStyle = '#00ff00';
    const ausX = ((143 + 180) / 360) * width;
    const ausY = ((90 + 38) / 180) * height;
    ctx.beginPath();
    ctx.arc(ausX, ausY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Labels
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('0,0', zeroX + 40, zeroY + 10);
    ctx.fillText('AUS', ausX + 40, ausY + 10);
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
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
 */
export async function createGlobe(radius, useDebugTexture = true) {
  // High segment count for smooth sphere at this scale
  const geometry = new THREE.SphereGeometry(radius, 128, 64);

  let material;

  // Load Blue Marble texture
  const textureLoader = new THREE.TextureLoader();
  try {
    const blueMarble = await new Promise((resolve, reject) => {
      textureLoader.load('/textures/blue_marble.jpg', resolve, undefined, reject);
    });

    // Create combined texture with debug overlay
    const combinedTexture = createCombinedTexture(blueMarble.image, useDebugTexture);
    combinedTexture.colorSpace = THREE.SRGBColorSpace;
    // Flip texture horizontally for BackSide rendering
    combinedTexture.wrapS = THREE.RepeatWrapping;
    combinedTexture.repeat.x = -1;

    material = new THREE.MeshBasicMaterial({
      map: combinedTexture,
      side: THREE.BackSide,
    });
  } catch (error) {
    console.warn('Blue Marble texture not found, using debug grid only', error);
    const texture = createGridTexture();
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
