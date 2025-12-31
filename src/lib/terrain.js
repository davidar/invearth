import * as THREE from 'three';

// Mapbox API configuration
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Earth radius in km (1 unit = 1 km)
const EARTH_RADIUS = 6371;

// Quadtree LOD configuration
const MIN_ZOOM = 6;   // Coarsest level (largest tiles)
const MAX_ZOOM = 12;  // Finest level (smallest tiles, near camera)

// How far inside the globe surface to place terrain (km)
// Needs enough gap to avoid z-fighting with globe at tile edges
const TERRAIN_OFFSET = 8;

// Subdivision threshold multiplier
// Tile is subdivided if: distance < tileSize * SUBDIVISION_FACTOR
// Higher = more aggressive subdivision = more tiles
const SUBDIVISION_FACTOR = 2.0;

// Maximum radius from camera to load terrain (km)
const MAX_TERRAIN_RADIUS = 800;

// Debug mode: use colored tiles instead of Mapbox
const DEBUG_MODE = false;

// Debug colors for each zoom level
const DEBUG_COLORS = {
  6: 0xffff00,  // Yellow
  7: 0xff8800,  // Orange
  8: 0x0000ff,  // Blue
  9: 0x00ffff,  // Cyan
  10: 0x00ff00, // Green
  11: 0xff00ff, // Magenta
  12: 0xff0000, // Red (highest detail)
};

/**
 * Creates multi-LOD terrain using quadtree subdivision
 * @param {Object} location - { lat, lon } camera position
 */
export async function createTerrain(location) {
  if (!MAPBOX_TOKEN) {
    console.warn('No Mapbox token provided. Set VITE_MAPBOX_TOKEN in .env');
    return createPlaceholderTerrain(location);
  }

  const { lat, lon } = location;
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'terrain-quadtree';

  // Get leaf tiles from quadtree traversal
  const leafTiles = getQuadtreeLeafTiles(lat, lon);
  console.log(`Quadtree: ${leafTiles.length} leaf tiles`);

  // Count tiles per zoom level
  const zoomCounts = {};
  for (const tile of leafTiles) {
    zoomCounts[tile.z] = (zoomCounts[tile.z] || 0) + 1;
  }
  console.log('Tiles per zoom:', zoomCounts);

  if (DEBUG_MODE) {
    // Debug mode: create colored tiles without fetching
    for (const tile of leafTiles) {
      const tileMesh = createDebugTileMesh(tile);
      if (tileMesh) {
        terrainGroup.add(tileMesh);
      }
    }
  } else {
    // Normal mode: fetch Mapbox tiles
    const tileData = await Promise.all(
      leafTiles.map(tile => fetchTile(tile))
    );

    for (const tile of tileData) {
      if (!tile.terrain || !tile.satellite) continue;

      const tileMesh = createSphericalTileMesh(tile);
      if (tileMesh) {
        terrainGroup.add(tileMesh);
      }
    }
  }

  return terrainGroup;
}

/**
 * Traverse quadtree and return leaf tiles (tiles that won't be subdivided)
 */
function getQuadtreeLeafTiles(cameraLat, cameraLon) {
  const leafTiles = [];

  // Start with coarse tiles covering the area
  const startTiles = getStartingTiles(cameraLat, cameraLon, MIN_ZOOM);

  // Process each starting tile recursively
  for (const tile of startTiles) {
    collectLeafTiles(tile, cameraLat, cameraLon, leafTiles);
  }

  return leafTiles;
}

/**
 * Get starting tiles at MIN_ZOOM that cover the terrain area
 */
function getStartingTiles(centerLat, centerLon, zoom) {
  const tiles = [];

  // Convert max radius to degrees
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(centerLat * Math.PI / 180);
  const radiusDegLat = MAX_TERRAIN_RADIUS / kmPerDegLat;
  const radiusDegLon = MAX_TERRAIN_RADIUS / kmPerDegLon;

  // Get bounding box in tile coordinates
  const minTile = latLonToTile(centerLat + radiusDegLat, centerLon - radiusDegLon, zoom);
  const maxTile = latLonToTile(centerLat - radiusDegLat, centerLon + radiusDegLon, zoom);

  for (let y = minTile.y; y <= maxTile.y; y++) {
    for (let x = minTile.x; x <= maxTile.x; x++) {
      const bounds = getTileBounds(x, y, zoom);
      const tileCenter = {
        lat: (bounds.north + bounds.south) / 2,
        lon: (bounds.east + bounds.west) / 2
      };

      // Only include tiles within max radius
      const dist = haversineDistance(centerLat, centerLon, tileCenter.lat, tileCenter.lon);
      if (dist < MAX_TERRAIN_RADIUS + getTileSizeKm(bounds)) {
        tiles.push({ x, y, z: zoom, bounds });
      }
    }
  }

  return tiles;
}

/**
 * Recursively collect leaf tiles - subdivide if close to camera
 */
function collectLeafTiles(tile, cameraLat, cameraLon, leafTiles) {
  const { x, y, z, bounds } = tile;

  // Calculate distance from camera to tile center
  const tileCenter = {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2
  };
  const distance = haversineDistance(cameraLat, cameraLon, tileCenter.lat, tileCenter.lon);

  // Calculate tile size in km
  const tileSizeKm = getTileSizeKm(bounds);

  // Skip if too far from camera
  if (distance > MAX_TERRAIN_RADIUS + tileSizeKm) {
    return;
  }

  // Decide whether to subdivide
  // Subdivide if: close enough AND not at max zoom
  const shouldSubdivide = z < MAX_ZOOM && distance < tileSizeKm * SUBDIVISION_FACTOR;

  if (shouldSubdivide) {
    // Get 4 child tiles at next zoom level
    const children = getChildTiles(x, y, z);
    for (const child of children) {
      collectLeafTiles(child, cameraLat, cameraLon, leafTiles);
    }
  } else {
    // This is a leaf tile - add it
    leafTiles.push(tile);
  }
}

/**
 * Get the 4 child tiles of a parent tile
 */
function getChildTiles(x, y, z) {
  const childZoom = z + 1;
  const childX = x * 2;
  const childY = y * 2;

  return [
    { x: childX, y: childY, z: childZoom, bounds: getTileBounds(childX, childY, childZoom) },
    { x: childX + 1, y: childY, z: childZoom, bounds: getTileBounds(childX + 1, childY, childZoom) },
    { x: childX, y: childY + 1, z: childZoom, bounds: getTileBounds(childX, childY + 1, childZoom) },
    { x: childX + 1, y: childY + 1, z: childZoom, bounds: getTileBounds(childX + 1, childY + 1, childZoom) },
  ];
}

/**
 * Get approximate tile size in km
 */
function getTileSizeKm(bounds) {
  const latSpan = Math.abs(bounds.north - bounds.south);
  const lonSpan = Math.abs(bounds.east - bounds.west);
  const avgLat = (bounds.north + bounds.south) / 2;
  const kmPerDegLon = 111.32 * Math.cos(avgLat * Math.PI / 180);
  return Math.max(latSpan * 111.32, lonSpan * kmPerDegLon);
}

/**
 * Get lat/lon bounds for a tile
 */
function getTileBounds(x, y, zoom) {
  const n = Math.pow(2, zoom);

  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;

  const northRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));

  return {
    north: northRad * 180 / Math.PI,
    south: southRad * 180 / Math.PI,
    west,
    east
  };
}

/**
 * Haversine distance between two points in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Creates a debug tile mesh with zoom-based color
 */
function createDebugTileMesh(tile) {
  const { bounds, z: zoom } = tile;

  const baseRadius = EARTH_RADIUS - TERRAIN_OFFSET;

  // Calculate tile center position
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLon = (bounds.east + bounds.west) / 2;

  const phi = (90 - centerLat) * (Math.PI / 180);
  const theta = -centerLon * Math.PI / 180;

  const x = baseRadius * Math.sin(phi) * Math.sin(theta);
  const y = baseRadius * Math.cos(phi);
  const z = baseRadius * Math.sin(phi) * Math.cos(theta);

  // Tile size based on zoom level
  const tileSize = getTileSizeKm(bounds) / 4;
  const geometry = new THREE.SphereGeometry(Math.max(tileSize, 5), 8, 8);

  const color = DEBUG_COLORS[zoom] || 0xffffff;
  const material = new THREE.MeshBasicMaterial({
    color: color,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.name = `debug-tile-${tile.x}-${tile.y}-z${zoom}`;

  return mesh;
}

/**
 * Creates a spherical tile mesh - vertices on the INSIDE of the sphere
 */
function createSphericalTileMesh(tileData) {
  const { bounds, terrain, satellite, z: zoom } = tileData;

  // Segments per tile - more for higher zoom (more detail)
  const segments = Math.min(64, Math.max(16, Math.pow(2, zoom - 6)));

  // Create geometry
  const geometry = new THREE.BufferGeometry();

  const vertices = [];
  const uvs = [];
  const indices = [];

  // Get heightmap data
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = terrain.width;
  heightCanvas.height = terrain.height;
  const heightCtx = heightCanvas.getContext('2d');
  heightCtx.drawImage(terrain, 0, 0);
  const heightData = heightCtx.getImageData(0, 0, terrain.width, terrain.height);
  const heightPixels = heightData.data;

  // Base radius for terrain
  const baseRadius = EARTH_RADIUS - TERRAIN_OFFSET;

  // Generate vertices on sphere surface
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const v = j / segments;

      // Interpolate lat/lon within tile bounds
      const lat = bounds.north + (bounds.south - bounds.north) * v;
      const lon = bounds.west + (bounds.east - bounds.west) * u;

      // Sample heightmap
      const px = Math.floor(u * (terrain.width - 1));
      const py = Math.floor(v * (terrain.height - 1));
      const pixelIndex = (py * terrain.width + px) * 4;

      const r = heightPixels[pixelIndex];
      const g = heightPixels[pixelIndex + 1];
      const b = heightPixels[pixelIndex + 2];

      // Decode Mapbox terrain-RGB to elevation in meters
      const elevationMeters = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);

      // Convert to km with exaggeration, clamp ocean depth
      const clampedElevation = elevationMeters < 0 ? Math.max(elevationMeters, -50) : elevationMeters;
      const elevationKm = (clampedElevation / 1000) * 3; // 3x exaggeration

      // INVERTED WORLD: Subtract elevation to bring higher terrain closer to center
      const radius = baseRadius - elevationKm;

      // Convert lat/lon to spherical coordinates
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = -lon * Math.PI / 180;

      // Spherical to Cartesian (THREE.js convention)
      const x = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.cos(theta);

      vertices.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }

  // Generate indices
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + 1;
      const c = a + (segments + 1);
      const d = c + 1;

      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Add skirt geometry
  const skirtData = generateSkirt(vertices, indices, segments);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [...vertices, ...skirtData.vertices], 3
  ));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(
    [...uvs, ...skirtData.uvs], 2
  ));
  geometry.setIndex([...indices, ...skirtData.indices]);

  geometry.computeVertexNormals();

  // Create texture from satellite imagery
  const satCanvas = document.createElement('canvas');
  satCanvas.width = satellite.width;
  satCanvas.height = satellite.height;
  const satCtx = satCanvas.getContext('2d');
  satCtx.drawImage(satellite, 0, 0);

  const texture = new THREE.CanvasTexture(satCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `tile-${tileData.x}-${tileData.y}-z${zoom}`;

  return mesh;
}

/**
 * Generate skirt geometry to hide seams between tiles
 */
function generateSkirt(mainVertices, mainIndices, segments) {
  const vertices = [];
  const uvs = [];
  const indices = [];

  const skirtDepth = 0.5; // km
  const vertexCount = mainVertices.length / 3;

  const getVertex = (idx) => ({
    x: mainVertices[idx * 3],
    y: mainVertices[idx * 3 + 1],
    z: mainVertices[idx * 3 + 2]
  });

  const extendOutward = (v) => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const scale = (len + skirtDepth) / len;
    return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
  };

  const edges = [
    Array.from({ length: segments + 1 }, (_, i) => i),
    Array.from({ length: segments + 1 }, (_, i) => segments * (segments + 1) + i),
    Array.from({ length: segments + 1 }, (_, j) => j * (segments + 1)),
    Array.from({ length: segments + 1 }, (_, j) => j * (segments + 1) + segments),
  ];

  let skirtVertexOffset = vertexCount;

  for (const edge of edges) {
    const edgeStart = vertices.length / 3;

    for (const idx of edge) {
      const v = getVertex(idx);
      const extended = extendOutward(v);

      vertices.push(v.x, v.y, v.z);
      uvs.push(0.5, 0.5);

      vertices.push(extended.x, extended.y, extended.z);
      uvs.push(0.5, 0.5);
    }

    for (let i = 0; i < edge.length - 1; i++) {
      const a = edgeStart + i * 2;
      const b = edgeStart + i * 2 + 1;
      const c = edgeStart + (i + 1) * 2;
      const d = edgeStart + (i + 1) * 2 + 1;

      indices.push(skirtVertexOffset + a, skirtVertexOffset + b, skirtVertexOffset + c);
      indices.push(skirtVertexOffset + c, skirtVertexOffset + b, skirtVertexOffset + d);
    }
  }

  return { vertices, uvs, indices };
}

/**
 * Convert lat/lon to tile coordinates
 */
function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z: zoom };
}

/**
 * Fetch heightmap and satellite imagery for a tile
 */
async function fetchTile(tile) {
  const { x, y, z } = tile;

  const terrainUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${MAPBOX_TOKEN}`;
  const satelliteUrl = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg?access_token=${MAPBOX_TOKEN}`;

  try {
    const [terrainImg, satelliteImg] = await Promise.all([
      loadImage(terrainUrl),
      loadImage(satelliteUrl),
    ]);

    return {
      ...tile,
      terrain: terrainImg,
      satellite: satelliteImg,
    };
  } catch (error) {
    console.warn(`Failed to load tile ${z}/${x}/${y}:`, error);
    return { ...tile, terrain: null, satellite: null };
  }
}

/**
 * Load an image and return it
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
 * Placeholder terrain when no Mapbox token available
 */
function createPlaceholderTerrain(location) {
  const { lat, lon } = location;

  const geometry = new THREE.SphereGeometry(
    EARTH_RADIUS - TERRAIN_OFFSET,
    32, 32,
    (lon - 5) * Math.PI / 180 + Math.PI,
    10 * Math.PI / 180,
    (90 - lat - 5) * Math.PI / 180,
    10 * Math.PI / 180
  );

  const material = new THREE.MeshStandardMaterial({
    color: 0x8b7355,
    side: THREE.BackSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain-placeholder';

  return mesh;
}
