import * as THREE from 'three';

// Mapbox API configuration
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

/**
 * Creates a local terrain patch from Mapbox tiles
 * @param {Object} location - { lat, lon }
 * @param {number} radius - Terrain patch radius in km
 */
export async function createTerrain(location, radius) {
  if (!MAPBOX_TOKEN) {
    console.warn('No Mapbox token provided. Set VITE_MAPBOX_TOKEN in .env');
    return createPlaceholderTerrain(location, radius);
  }

  const { lat, lon } = location;

  // Determine appropriate zoom level for the radius
  // At zoom 14, each tile covers ~1.5km at equator
  const zoom = 14;

  // Calculate tile coordinates for center
  const centerTile = latLonToTile(lat, lon, zoom);

  // Fetch terrain-rgb and satellite tiles
  // For ~3km radius at zoom 14, we need roughly 3x3 tiles
  const tileRange = 1; // tiles in each direction from center

  const tiles = [];
  for (let dx = -tileRange; dx <= tileRange; dx++) {
    for (let dy = -tileRange; dy <= tileRange; dy++) {
      tiles.push({
        x: centerTile.x + dx,
        y: centerTile.y + dy,
        z: zoom,
      });
    }
  }

  // Fetch all tiles
  const tileData = await Promise.all(
    tiles.map(tile => fetchTile(tile))
  );

  // Build mesh from tiles
  const terrain = buildTerrainMesh(tileData, location, radius);

  return terrain;
}

/**
 * Convert lat/lon to tile coordinates
 */
function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x, y, z: zoom };
}

/**
 * Fetch heightmap and satellite imagery for a tile
 */
async function fetchTile(tile) {
  const { x, y, z } = tile;

  // Terrain-RGB tile (heightmap)
  const terrainUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${MAPBOX_TOKEN}`;

  // Satellite tile
  const satelliteUrl = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg?access_token=${MAPBOX_TOKEN}`;

  const [terrainImg, satelliteImg] = await Promise.all([
    loadImage(terrainUrl),
    loadImage(satelliteUrl),
  ]);

  return {
    tile,
    terrain: terrainImg,
    satellite: satelliteImg,
  };
}

/**
 * Load an image and return ImageData
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

/**
 * Build terrain mesh from tile data
 */
function buildTerrainMesh(tileData, location, radius) {
  // For now, create a simple plane
  // Full implementation would stitch tiles and apply heightmap

  const geometry = new THREE.PlaneGeometry(
    radius * 2,
    radius * 2,
    128,
    128
  );

  // If we have satellite imagery, use it
  let material;
  if (tileData.length > 0 && tileData[0].satellite) {
    const texture = new THREE.Texture(tileData[0].satellite);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;

    material = new THREE.MeshStandardMaterial({
      map: texture,
    });
  } else {
    material = new THREE.MeshStandardMaterial({
      color: 0x3d5c3d, // Greenish ground
    });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';

  // Position terrain at the viewer's location on the sphere
  const { lat, lon } = location;
  const earthRadius = 6371;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const pos = new THREE.Vector3();
  pos.setFromSphericalCoords(earthRadius, phi, theta);
  mesh.position.copy(pos);

  // Orient terrain to lie on sphere surface (normal pointing to center)
  mesh.lookAt(0, 0, 0);

  // Slight offset to avoid z-fighting with globe
  mesh.position.multiplyScalar(0.999);

  return mesh;
}

/**
 * Placeholder terrain when no Mapbox token available
 */
function createPlaceholderTerrain(location, radius) {
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2, 32, 32);

  // Add some noise for terrain-like appearance
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    positions.setZ(i, z + (Math.random() - 0.5) * 0.1);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x8b7355, // Sandy brown
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain-placeholder';

  // Position at viewer location
  const { lat, lon } = location;
  const earthRadius = 6371;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const pos = new THREE.Vector3();
  pos.setFromSphericalCoords(earthRadius, phi, theta);
  mesh.position.copy(pos);
  mesh.lookAt(0, 0, 0);
  mesh.position.multiplyScalar(0.999);

  return mesh;
}
