import * as THREE from 'three';

// Mapbox API configuration
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Earth radius in km (1 unit = 1 km)
const EARTH_RADIUS = 6371;

// LOD ring configuration
// Each ring: { zoom, innerRadius (km), outerRadius (km) }
// Tuned to keep tile counts reasonable (~10-30 tiles per ring)
const LOD_RINGS = [
  { zoom: 12, innerRadius: 0, outerRadius: 30 },     // ~9 tiles, high detail near camera
  { zoom: 10, innerRadius: 30, outerRadius: 100 },   // ~16 tiles
  { zoom: 8, innerRadius: 100, outerRadius: 300 },   // ~16 tiles
  { zoom: 6, innerRadius: 300, outerRadius: 800 },   // ~12 tiles
];

// How far inside the globe surface to place terrain (km)
// Terrain radius = EARTH_RADIUS - TERRAIN_OFFSET
// Camera is at EARTH_RADIUS - 50, so terrain must have smaller offset (larger radius)
// to be visible as "ground" (between camera and globe surface)
const TERRAIN_OFFSET = 3;

// Debug mode: use colored tiles instead of Mapbox
const DEBUG_MODE = false;

// Debug colors for each LOD level (index 0 = highest detail)
const DEBUG_COLORS = [
  0xff0000, // Red - z12 (0-30km)
  0x00ff00, // Green - z10 (30-100km)
  0x0000ff, // Blue - z8 (100-300km)
  0xffff00, // Yellow - z6 (300-800km)
];

/**
 * Creates multi-LOD terrain from Mapbox tiles
 * @param {Object} location - { lat, lon }
 * @param {number} maxRadius - Maximum terrain radius in km (optional, uses LOD_RINGS max)
 */
export async function createTerrain(location, maxRadius) {
  if (!MAPBOX_TOKEN) {
    console.warn('No Mapbox token provided. Set VITE_MAPBOX_TOKEN in .env');
    return createPlaceholderTerrain(location);
  }

  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'terrain-lod';

  // Load each LOD ring
  for (let i = 0; i < LOD_RINGS.length; i++) {
    const ring = LOD_RINGS[i];
    if (maxRadius && ring.innerRadius >= maxRadius) break;

    console.log(`Loading LOD ring: z${ring.zoom}, ${ring.innerRadius}-${ring.outerRadius}km`);

    try {
      const ringMesh = await createLODRing(location, ring, i);
      if (ringMesh) {
        terrainGroup.add(ringMesh);
      }
    } catch (error) {
      console.error(`Failed to load ring z${ring.zoom}:`, error);
    }
  }

  return terrainGroup;
}

/**
 * Creates a single LOD ring from tiles
 * @param {number} lodIndex - Index in LOD_RINGS array (0 = highest detail)
 */
async function createLODRing(location, ring, lodIndex) {
  const { lat, lon } = location;
  const { zoom, innerRadius, outerRadius } = ring;

  // Calculate which tiles we need for this ring
  const tiles = getTilesForRing(lat, lon, zoom, innerRadius, outerRadius);

  if (tiles.length === 0) {
    console.warn(`No tiles for ring z${zoom}`);
    return null;
  }

  console.log(`  ${tiles.length} tiles for z${zoom}`);

  // Create a mesh for each tile
  const ringGroup = new THREE.Group();
  ringGroup.name = `ring-z${zoom}`;

  if (DEBUG_MODE) {
    // Debug mode: create colored tiles without fetching
    for (const tile of tiles) {
      const tileMesh = createDebugTileMesh(tile, zoom, lodIndex);
      if (tileMesh) {
        ringGroup.add(tileMesh);
      }
    }
  } else {
    // Normal mode: fetch Mapbox tiles
    const tileData = await Promise.all(
      tiles.map(tile => fetchTile(tile))
    );

    for (const tile of tileData) {
      if (!tile.terrain || !tile.satellite) continue;

      const tileMesh = createSphericalTileMesh(tile, zoom, lodIndex);
      if (tileMesh) {
        ringGroup.add(tileMesh);
      }
    }
  }

  return ringGroup;
}

/**
 * Get all tiles needed to cover a ring area at a given zoom level
 */
function getTilesForRing(centerLat, centerLon, zoom, innerRadiusKm, outerRadiusKm) {
  const tiles = [];

  // Convert radii to degrees (approximate)
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos(centerLat * Math.PI / 180);

  const outerDegLat = outerRadiusKm / kmPerDegLat;
  const outerDegLon = outerRadiusKm / kmPerDegLon;

  // Get bounding box in tile coordinates
  const minTile = latLonToTile(centerLat + outerDegLat, centerLon - outerDegLon, zoom);
  const maxTile = latLonToTile(centerLat - outerDegLat, centerLon + outerDegLon, zoom);

  // Iterate through all tiles in bounding box
  for (let y = minTile.y; y <= maxTile.y; y++) {
    for (let x = minTile.x; x <= maxTile.x; x++) {
      // Check if this tile intersects the ring (between inner and outer radius)
      const tileBounds = getTileBounds(x, y, zoom);
      const tileCenter = {
        lat: (tileBounds.north + tileBounds.south) / 2,
        lon: (tileBounds.east + tileBounds.west) / 2
      };

      // Calculate distance to tile center AND approximate tile radius
      const distKm = haversineDistance(centerLat, centerLon, tileCenter.lat, tileCenter.lon);

      // Approximate tile size in km (tiles are larger at lower zoom levels)
      const tileLatSpan = Math.abs(tileBounds.north - tileBounds.south);
      const tileLonSpan = Math.abs(tileBounds.east - tileBounds.west);
      const tileRadiusKm = Math.max(tileLatSpan, tileLonSpan) * 111.32 / 2; // rough km estimate

      // Include tile if it INTERSECTS the ring (not just center inside)
      // Tile intersects if: (dist - tileRadius) < outerRadius AND (dist + tileRadius) > innerRadius
      const tileInner = distKm - tileRadiusKm;
      const tileOuter = distKm + tileRadiusKm;

      if (tileInner < outerRadiusKm && tileOuter > innerRadiusKm) {
        tiles.push({ x, y, z: zoom, bounds: tileBounds });
      }
    }
  }

  return tiles;
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
  const R = 6371; // Earth radius in km
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
 * Creates a debug tile mesh with solid color - for visualizing LOD placement
 * Using simple sphere at tile center for reliable visibility testing
 */
function createDebugTileMesh(tile, zoom, lodIndex) {
  const { bounds } = tile;

  // LOD radius offset
  const lodRadiusOffset = lodIndex * 1.0;
  const baseRadius = EARTH_RADIUS - TERRAIN_OFFSET - lodRadiusOffset;

  // Calculate tile center position
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLon = (bounds.east + bounds.west) / 2;

  const phi = (90 - centerLat) * (Math.PI / 180);
  const theta = -centerLon * Math.PI / 180;

  // THREE.js spherical convention: x=r*sin(phi)*sin(theta), y=r*cos(phi), z=r*sin(phi)*cos(theta)
  const x = baseRadius * Math.sin(phi) * Math.sin(theta);
  const y = baseRadius * Math.cos(phi);
  const z = baseRadius * Math.sin(phi) * Math.cos(theta);

  // Use simple sphere geometry for each tile - make z12 big and visible!
  const tileSize = lodIndex === 0 ? 15 : (lodIndex === 1 ? 10 : (lodIndex === 2 ? 20 : 40));
  const geometry = new THREE.SphereGeometry(tileSize, 8, 8);

  const color = DEBUG_COLORS[lodIndex] || 0xffffff;
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
 *
 * INVERTED WORLD: We're inside the sphere looking at its inner surface.
 * - Base radius = EARTH_RADIUS - TERRAIN_OFFSET (inside the globe)
 * - Positive elevation SUBTRACTS from radius (closer to center = higher)
 * - Normals point inward (toward center) or use BackSide rendering
 * - LOD index determines radius offset: higher detail = smaller radius = closer to camera
 */
function createSphericalTileMesh(tileData, zoom, lodIndex = 0) {
  const { bounds, terrain, satellite } = tileData;

  // Segments per tile - more for higher zoom (closer = more detail)
  const segments = Math.min(64, Math.max(16, Math.pow(2, zoom - 8)));

  // LOD radius offset: higher LOD index = smaller radius = closer to center = further "up"
  // z12 (index 0) closest to camera, z6 furthest toward center
  const lodRadiusOffset = lodIndex * 0.5; // 0.5km per LOD level

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

  // Base radius for terrain (inside the globe, closer to center than camera)
  // Subtract LOD offset: higher LOD index = smaller radius = further toward center
  const baseRadius = EARTH_RADIUS - TERRAIN_OFFSET - lodRadiusOffset;

  // Generate vertices on sphere surface
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      // UV coordinates (0-1)
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
      // phi = angle from north pole, theta = angle around equator
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = -lon * Math.PI / 180; // Negative to match globe texture orientation

      // Spherical to Cartesian (THREE.js convention)
      // x = r * sin(phi) * sin(theta), y = r * cos(phi), z = r * sin(phi) * cos(theta)
      const x = radius * Math.sin(phi) * Math.sin(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.cos(theta);

      vertices.push(x, y, z);
      uvs.push(u, 1 - v); // Flip V for texture orientation
    }
  }

  // Generate indices
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i;
      const b = a + 1;
      const c = a + (segments + 1);
      const d = c + 1;

      // Two triangles per quad - wound for BackSide rendering (CCW when viewed from inside)
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  // Add skirt vertices and indices
  const skirtData = generateSkirt(vertices, indices, segments, baseRadius);

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

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide, // Visible from both sides while debugging
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `tile-${tileData.x}-${tileData.y}-z${tileData.z}`;

  return mesh;
}

/**
 * Generate skirt geometry to hide seams between LOD levels
 * Skirts extend radially outward (away from center) to fill gaps
 */
function generateSkirt(mainVertices, mainIndices, segments, baseRadius) {
  const vertices = [];
  const uvs = [];
  const indices = [];

  const skirtDepth = 0.5; // km - how far the skirt extends outward
  const vertexCount = mainVertices.length / 3;

  // Helper to get vertex position
  const getVertex = (idx) => ({
    x: mainVertices[idx * 3],
    y: mainVertices[idx * 3 + 1],
    z: mainVertices[idx * 3 + 2]
  });

  // Helper to extend vertex outward (away from center)
  const extendOutward = (v) => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const scale = (len + skirtDepth) / len;
    return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
  };

  // Process each edge of the tile
  const edges = [
    // Top edge (j=0)
    Array.from({ length: segments + 1 }, (_, i) => i),
    // Bottom edge (j=segments)
    Array.from({ length: segments + 1 }, (_, i) => segments * (segments + 1) + i),
    // Left edge (i=0)
    Array.from({ length: segments + 1 }, (_, j) => j * (segments + 1)),
    // Right edge (i=segments)
    Array.from({ length: segments + 1 }, (_, j) => j * (segments + 1) + segments),
  ];

  let skirtVertexOffset = vertexCount;

  for (const edge of edges) {
    const edgeStart = vertices.length / 3;

    // Add skirt vertices for this edge
    for (const idx of edge) {
      const v = getVertex(idx);
      const extended = extendOutward(v);

      // Original vertex (duplicate for skirt)
      vertices.push(v.x, v.y, v.z);
      uvs.push(0.5, 0.5); // Skirt UVs don't matter much

      // Extended vertex
      vertices.push(extended.x, extended.y, extended.z);
      uvs.push(0.5, 0.5);
    }

    // Add indices for skirt triangles
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edgeStart + i * 2;
      const b = edgeStart + i * 2 + 1;
      const c = edgeStart + (i + 1) * 2;
      const d = edgeStart + (i + 1) * 2 + 1;

      // Two triangles per quad
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

  // Terrain-RGB tile (heightmap)
  const terrainUrl = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${z}/${x}/${y}.pngraw?access_token=${MAPBOX_TOKEN}`;

  // Satellite tile (2x for higher res)
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

  // Create a simple spherical patch
  const geometry = new THREE.SphereGeometry(
    EARTH_RADIUS - TERRAIN_OFFSET,
    32, 32,
    (lon - 5) * Math.PI / 180 + Math.PI, // phiStart
    10 * Math.PI / 180, // phiLength
    (90 - lat - 5) * Math.PI / 180, // thetaStart
    10 * Math.PI / 180 // thetaLength
  );

  const material = new THREE.MeshStandardMaterial({
    color: 0x8b7355,
    side: THREE.BackSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain-placeholder';

  return mesh;
}
