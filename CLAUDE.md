# Inverted Earth Visualization

## Project Overview
An art piece showing Earth from the inside - standing on a sphere looking outward, with continents curving up overhead like a Dyson sphere. Built with Three.js + Vite.

## Key Concepts

### Inverted World Coordinate System
- Camera is INSIDE the sphere (radius - offset)
- "Up" points TOWARD sphere center (inverted gravity)
- "Down" points AWAY from center (outward toward globe surface)
- We look OUTWARD at the inner surface of the sphere (the "ground" curves up around us)
- Globe uses `BackSide` rendering so we see the texture from inside

### CRITICAL: Radius and "Altitude" in Inverted World
**This is confusing - pay attention!**
- Globe surface is at `EARTH_RADIUS` (6371 km)
- Objects INSIDE the sphere have `radius = EARTH_RADIUS - offset`
- **LARGER offset = SMALLER radius = CLOSER to center = HIGHER altitude**
- **SMALLER offset = LARGER radius = CLOSER to globe surface = LOWER altitude**

Example with TERRAIN_OFFSET=8 and camera at 10km offset:
- Globe: radius 6371 (the outer shell we're inside)
- Terrain: radius 6363 (8km inside globe)
- Camera: radius 6361 (10km inside globe, 2km "above" terrain)
- Camera has LARGER offset, so it's CLOSER to center, so it's ABOVE terrain ✓

**Common mistake**: Thinking "smaller offset = higher up". NO! Smaller offset = larger radius = closer to globe = underground!

### Coordinate Conversions
```javascript
// Lat/lon to Three.js spherical
phi = (90 - lat) * (Math.PI / 180)
theta = -lon * Math.PI / 180  // negative because of texture flip + globe rotation

// Position on sphere - THREE.js convention (IMPORTANT: don't swap x/z!)
x = radius * Math.sin(phi) * Math.sin(theta)
y = radius * Math.cos(phi)
z = radius * Math.sin(phi) * Math.cos(theta)

// Or use the helper:
position.setFromSphericalCoords(radius, phi, theta)

// Local directions at a point
up = position.normalize().negate()  // toward center
east = up.cross(worldNorth).normalize()
north = east.cross(up).normalize()
```

### Terrain System (Quadtree LOD)
- Uses quadtree subdivision: coarse tiles (z6) far away, subdivides to fine tiles (z14) near camera
- Subdivision rule: if `distance < tileSize * SUBDIVISION_FACTOR`, subdivide into 4 children
- Current settings: MIN_ZOOM=6, MAX_ZOOM=14, SUBDIVISION_FACTOR=3.0, TERRAIN_OFFSET=8km
- Only renders leaf tiles (no overlap, no z-fighting between LOD levels)
- Fetches Mapbox terrain-RGB (heightmap) and satellite tiles
- Each tile is a spherical mesh curving to match inside of globe
- Skirts on tile edges hide seams between adjacent tiles
- Camera at 10km offset (2km above terrain) for good detail view

### Elevation
- Mapbox terrain-RGB decoded: `elevation = -10000 + (R*256*256 + G*256 + B) * 0.1`
- Ocean has negative elevation, land positive
- Currently 3x exaggeration, ocean depth clamped to -50m to prevent deep chasms
- Positive Z on terrain mesh = toward sphere center = "up" in inverted world

### Atmospheric Scattering (Thin Shell Model)
- Atmosphere modeled as thin shell clinging to inner surface (not filling entire sphere)
- Path length calculated via ray-sphere intersection for inner/outer atmosphere bounds
- Maximum haze at "horizon" angles (tangent path through shell)
- Clearer for overhead distant terrain (path: local atmo → void → remote atmo)
- Atmosphere color shifts from blue (day) to dark (night) based on sun position

### Day/Night Lighting
- `uSunDirection` uniform controls which parts are lit
- Globe blends between day texture (Mapbox satellite) and night texture (city lights)
- Night lights from Solar System Scope (CC BY 4.0): `public/textures/earth_nightmap.jpg`
- Day factor calculated as `smoothstep(-0.1, 0.2, dot(surfaceNormal, sunDirection))`
- **IMPORTANT**: Atmosphere scattering uses BOTH local and remote day factors
  - Local atmosphere (near camera) contributes blue scatter even when viewing night side
  - This prevents the night side from "punching a hole" through the atmosphere
  - Combined factor = average of local and remote day factors

## File Structure
- `src/main.js` - Scene setup, camera positioning, lighting config
- `src/lib/terrain.js` - Quadtree LOD terrain with Mapbox tiles
- `src/lib/globe.js` - Inverted sphere with day/night textures (Mapbox satellite + night lights)
- `src/lib/controls.js` - WASD movement + click-and-drag mouselook
- `src/lib/atmosphere.js` - Shader-based atmospheric scattering + day/night lighting

## Gotchas & Lessons Learned
1. **Offset vs altitude confusion**: LARGER offset = HIGHER altitude (closer to center). See "CRITICAL" section above.
2. **THREE.js spherical coords**: x = r*sin(φ)*sin(θ), z = r*sin(φ)*cos(θ). Don't swap them!
3. **Globe clipping**: Terrain must be several km inside globe surface or they z-fight
4. **Elevation direction**: In inverted world, SUBTRACT elevation from radius (higher terrain = smaller radius = closer to center)
5. **Pointer lock**: Doesn't work reliably in Flatpak Chrome - use click-and-drag instead
6. **Tile coordinate system**: Tile Y increases SOUTHWARD (opposite of lat)
7. **Color consistency**: Use same imagery source (Mapbox) for both globe and terrain tiles
8. **Material consistency**: Both globe and terrain use MeshBasicMaterial (no lighting) for consistent brightness
9. **Ring-based LOD causes z-fighting**: Use quadtree instead - tiles replace parents, never overlap
10. **Day/night atmosphere**: When viewing night side from day side, atmosphere must account for BOTH ends of the path. Local sunlit atmosphere still scatters blue even when looking at dark terrain.

## Current Location
Cape Otway Lighthouse, Victoria, Australia
- lat: -38.8539766
- lon: 143.5105863

## Potential Next Steps
- ~~Foveated/multi-zoom terrain~~ ✓ Done (quadtree LOD)
- ~~Movement controls~~ ✓ Done (WASD + Q/E altitude + mouselook)
- ~~Atmosphere rendering~~ ✓ Done (shader-based thin shell scattering)
- ~~Time of day lighting~~ ✓ Done (day/night with city lights)
- Dynamic tile loading as you move
- Clouds layer
- Animated day/night cycle (sun rotation over time)

## Environment
- Mapbox token in `.env` as `VITE_MAPBOX_TOKEN`
- Run with `npm run dev`
- Flatpak Chrome needs `--ozone-platform=x11` for WebGL
