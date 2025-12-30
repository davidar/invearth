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

  // Calculate appropriate zoom level for the radius
  // At equator: tile width = 40075km / 2^zoom
  // At latitude: tile width = cos(lat) * 40075km / 2^zoom
  const earthCircumference = 40075; // km
  const latRadians = Math.abs(lat) * Math.PI / 180;
  const metersPerTileAtLat = (zoom) => Math.cos(latRadians) * earthCircumference / Math.pow(2, zoom);

  // Choose zoom so we need ~7-9 tiles across for more coverage
  let zoom = 14;
  while (zoom > 10 && (2 * radius) / metersPerTileAtLat(zoom) > 9) {
    zoom--;
  }

  const tileWidthKm = metersPerTileAtLat(zoom);
  const tilesNeeded = Math.ceil((2 * radius) / tileWidthKm);
  const tileRange = Math.floor(tilesNeeded / 2);

  console.log(`Terrain: zoom=${zoom}, tileWidth=${tileWidthKm.toFixed(2)}km, tileRange=${tileRange}, total=${(2*tileRange+1)**2} tiles`);

  // Calculate tile coordinates for center
  const centerTile = latLonToTile(lat, lon, zoom);

  // Calculate the actual center of our tile grid in lat/lon
  // This ensures the terrain texture aligns with geographic position
  const gridCenterLat = tileToLatLon(centerTile.x, centerTile.y, zoom);

  // Build tile grid
  const tiles = [];
  for (let dy = -tileRange; dy <= tileRange; dy++) {
    for (let dx = -tileRange; dx <= tileRange; dx++) {
      tiles.push({
        x: centerTile.x + dx,
        y: centerTile.y + dy,
        z: zoom,
        gridX: dx + tileRange, // position in our grid (0-indexed)
        gridY: dy + tileRange,
      });
    }
  }

  // Fetch all tiles
  const tileData = await Promise.all(
    tiles.map(tile => fetchTile(tile))
  );

  // Calculate offset from camera position to tile grid center (in km)
  // This offset is used to shift the terrain so the texture aligns with the camera
  const latDiff = lat - gridCenterLat.lat;
  const lonDiff = lon - gridCenterLat.lon;
  // Convert to km (approximate, good enough for small offsets)
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(lat * Math.PI / 180);
  const offsetNorthKm = latDiff * kmPerDegLat;
  const offsetEastKm = lonDiff * kmPerDegLon;

  console.log(`Tile grid center: ${gridCenterLat.lat.toFixed(4)}, ${gridCenterLat.lon.toFixed(4)}`);
  console.log(`Camera position: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  console.log(`Offset: north=${offsetNorthKm.toFixed(3)}km, east=${offsetEastKm.toFixed(3)}km`);

  // Build mesh from stitched tiles at tile grid center
  const gridSize = 2 * tileRange + 1;
  const actualCoverageKm = gridSize * tileWidthKm;
  const terrain = buildTerrainMesh(tileData, gridSize, gridCenterLat, actualCoverageKm / 2);

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
 * Convert tile coordinates to lat/lon (center of tile)
 */
function tileToLatLon(x, y, zoom) {
  const n = Math.pow(2, zoom);
  // Get center of tile by adding 0.5
  const lon = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

/**
 * Fetch heightmap and satellite imagery for a tile
 */
async function fetchTile(tile) {
  const { x, y, z } = tile;

  // Terrain-RGB tile (heightmap)
  const terrainUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${MAPBOX_TOKEN}`;

  // Satellite tile (2x for higher res)
  const satelliteUrl = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg?access_token=${MAPBOX_TOKEN}`;

  const [terrainImg, satelliteImg] = await Promise.all([
    loadImage(terrainUrl),
    loadImage(satelliteUrl),
  ]);

  return {
    ...tile,
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
 * Decode Mapbox terrain-RGB to elevation in meters
 */
function decodeTerrainRGB(r, g, b) {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}

/**
 * Build terrain mesh from stitched tile data
 */
function buildTerrainMesh(tileData, gridSize, location, radius) {
  // Composite all satellite tiles into one texture
  const tileSize = 512; // @2x tiles are 512px
  const compositeSize = gridSize * tileSize;

  const satCanvas = document.createElement('canvas');
  satCanvas.width = compositeSize;
  satCanvas.height = compositeSize;
  const satCtx = satCanvas.getContext('2d');

  // Composite heightmap tiles (256px each)
  const heightTileSize = 256;
  const heightCompositeSize = gridSize * heightTileSize;

  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = heightCompositeSize;
  heightCanvas.height = heightCompositeSize;
  const heightCtx = heightCanvas.getContext('2d');

  // Draw each tile into composite canvases
  for (const tile of tileData) {
    const { gridX, gridY, satellite, terrain } = tile;

    if (satellite) {
      satCtx.drawImage(satellite, gridX * tileSize, gridY * tileSize);
    }
    if (terrain) {
      heightCtx.drawImage(terrain, gridX * heightTileSize, gridY * heightTileSize);
    }
  }

  // Get heightmap pixel data
  const heightData = heightCtx.getImageData(0, 0, heightCompositeSize, heightCompositeSize);
  const heightPixels = heightData.data;

  // Create geometry with enough segments for detail
  const segments = Math.min(256, gridSize * 64); // More segments for larger grids
  const geometry = new THREE.PlaneGeometry(
    radius * 2,
    radius * 2,
    segments,
    segments
  );

  // Apply heightmap to geometry
  const positions = geometry.attributes.position;
  const verticesPerRow = segments + 1;

  for (let i = 0; i < positions.count; i++) {
    const vx = i % verticesPerRow;
    const vy = Math.floor(i / verticesPerRow);

    // Map vertex position to heightmap pixel position
    const px = Math.floor((vx / segments) * (heightCompositeSize - 1));
    const py = Math.floor((vy / segments) * (heightCompositeSize - 1));
    const pixelIndex = (py * heightCompositeSize + px) * 4;

    const r = heightPixels[pixelIndex];
    const g = heightPixels[pixelIndex + 1];
    const b = heightPixels[pixelIndex + 2];

    const elevation = decodeTerrainRGB(r, g, b);
    // Scale elevation - convert meters to km, then exaggerate for visibility
    // Clamp ocean depth to prevent deep chasms (ocean stays relatively flat)
    const clampedElevation = elevation < 0 ? Math.max(elevation, -50) : elevation;
    const elevationKm = (clampedElevation / 1000) * 3; // 3x exaggeration
    positions.setZ(i, elevationKm);
  }

  geometry.computeVertexNormals();

  // Create material with composite satellite texture
  const texture = new THREE.CanvasTexture(satCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';

  // Position terrain at Earth's surface (tangent to sphere)
  const { lat, lon } = location;
  const earthRadius = 6371;

  // Terrain position inside globe surface (between camera and globe in inverted view)
  const camPhi = (90 - lat) * (Math.PI / 180);
  const camTheta = -lon * Math.PI / 180;
  const surfacePos = new THREE.Vector3();
  surfacePos.setFromSphericalCoords(earthRadius - 3, camPhi, camTheta); // 3km inside globe

  // Calculate local directions at surface position
  const up = surfacePos.clone().normalize().negate(); // toward center
  const worldNorth = new THREE.Vector3(0, 1, 0);
  const east = up.clone().cross(worldNorth).normalize();
  const north = east.clone().cross(up).normalize(); // local north

  // Position terrain at the surface location
  mesh.position.copy(surfacePos);

  // Orient terrain to align with geographic directions
  // normal = toward center
  const normal = surfacePos.clone().normalize().negate(); // toward center

  // Recalculate east/north at terrain position for accurate orientation
  const terrainUp = normal.clone().negate(); // away from center
  const terrainEast = terrainUp.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const terrainNorth = terrainEast.clone().cross(terrainUp).normalize();

  // PlaneGeometry UV: U increases with +X, V increases with +Y
  // Canvas: X increases right (east), Y increases down (south)
  // Texture V is flipped from canvas Y, so canvas top (north) = texture top (high V)
  // So: local +X = east, local +Y = north
  mesh.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(terrainEast, terrainNorth, normal)
  );

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
    color: 0x8b7355,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain-placeholder';

  // Position at viewer location - match camera coordinate system
  const { lat, lon } = location;
  const earthRadius = 6371;
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = -lon * Math.PI / 180;

  const pos = new THREE.Vector3();
  pos.setFromSphericalCoords(earthRadius, phi, theta);
  mesh.position.copy(pos);

  mesh.lookAt(0, 0, 0);
  mesh.rotateX(Math.PI);

  return mesh;
}
