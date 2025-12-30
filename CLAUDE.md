# Inverted Earth Visualization

## Project Overview
An art piece showing Earth from the inside - standing on a sphere looking outward, with continents curving up overhead like a Dyson sphere. Built with Three.js + Vite.

## Key Concepts

### Inverted World Coordinate System
- Camera is INSIDE the sphere (radius - offset)
- "Up" points TOWARD sphere center (inverted gravity)
- "Down" points AWAY from center (outward)
- Terrain must be positioned INSIDE the globe surface to be visible (between camera and globe)
- Globe uses `BackSide` rendering so we see the texture from inside

### Coordinate Conversions
```javascript
// Lat/lon to Three.js spherical
phi = (90 - lat) * (Math.PI / 180)
theta = -lon * Math.PI / 180  // negative because of texture flip + globe rotation

// Position on sphere
position.setFromSphericalCoords(radius, phi, theta)

// Local directions at a point
up = position.normalize().negate()  // toward center
east = up.cross(worldNorth).normalize()
north = east.cross(up).normalize()
```

### Terrain System
- Fetches Mapbox terrain-RGB (heightmap) and satellite tiles
- Auto-calculates zoom level based on terrain radius
- Composites multiple tiles into single texture/heightmap
- Terrain positioned at TILE GRID CENTER (not camera position)
- Camera position only determines which tiles to load
- Terrain radius currently 30km, positioned 3km inside globe surface

### Elevation
- Mapbox terrain-RGB decoded: `elevation = -10000 + (R*256*256 + G*256 + B) * 0.1`
- Ocean has negative elevation, land positive
- Currently 3x exaggeration, ocean depth clamped to -50m to prevent deep chasms
- Positive Z on terrain mesh = toward sphere center = "up" in inverted world

## File Structure
- `src/main.js` - Scene setup, camera positioning, config
- `src/lib/terrain.js` - Mapbox tile fetching, stitching, mesh building
- `src/lib/globe.js` - Inverted sphere with Blue Marble texture
- `src/lib/controls.js` - Click-and-drag mouselook (Flatpak compatible)
- `src/lib/atmosphere.js` - Fog/atmosphere effects

## Gotchas & Lessons Learned
1. **Terrain alignment**: Position terrain at tile grid center, NOT camera position. Camera loc just determines tile fetching.
2. **Globe clipping**: Terrain must be several km inside globe surface or they clip through each other
3. **Elevation direction**: In inverted world, positive elevation should push vertices TOWARD center (positive Z after orientation)
4. **Pointer lock**: Doesn't work reliably in Flatpak Chrome - use click-and-drag instead
5. **Tile coordinate system**: Tile Y increases SOUTHWARD (opposite of lat)

## Current Location
Cape Otway Lighthouse, Victoria, Australia
- lat: -38.8539766
- lon: 143.5105863

## Potential Next Steps
- Foveated/multi-zoom terrain (high-res near camera, lower-res far away)
- Skybox or better atmosphere rendering
- Movement controls (walk around)
- Dynamic tile loading as you move
- Time of day lighting
- Clouds layer

## Environment
- Mapbox token in `.env` as `VITE_MAPBOX_TOKEN`
- Run with `npm run dev`
- Flatpak Chrome needs `--ozone-platform=x11` for WebGL
