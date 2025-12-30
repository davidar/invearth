# Inverted Earth Visualization

## Concept

A Three.js scene showing what Earth would look like from the inside - standing on the ground, terrain curves upward in all directions (no horizon), continents visible overhead on the far side of the sphere. An artistic/surreal piece, not a simulation.

## Core Architecture

### Two-layer approach

1. **Local terrain patch** (high detail)
   - Few km² around the viewpoint
   - Heightmap mesh draped with satellite imagery
   - This is the "ground" the viewer stands on

2. **Global inverted sphere** (medium detail)
   - Earth texture + heightmap displacement on inside of sphere
   - Radius ~6,371 km (Earth's actual radius, scaled appropriately)
   - The local patch occludes its corresponding area on the global sphere

### Coordinate system

- Camera positioned on inner surface of sphere
- "Up" vector points toward sphere center (inverted gravity)
- Y+ is toward center, not away from it

## Data Sources

### Local terrain

- **Heightmap:** Mapbox Terrain-RGB tiles (API key required, free tier fine)
- **Texture:** Mapbox Satellite tiles
- Fetch tiles for ~3-5 km radius around chosen point
- Stitch into single mesh + texture

### Global sphere

- **Texture:** NASA Blue Marble (static download, ~8k or higher resolution)
  - https://visibleearth.nasa.gov/collection/1484/blue-marble
- **Heightmap:** ETOPO1 or similar global elevation data
  - https://www.ngdc.noaa.gov/mgg/global/
- Apply as displacement on inverted sphere mesh

## Camera & Controls

- **Fixed position** - no movement, mouselook only
- **OrbitControls or PointerLockControls** modified so:
  - Camera doesn't move, only rotates
  - No "up" constraint fighting you (disable or invert)
- Looking straight up = seeing antipodal continents
- Looking straight down = looking at ground beneath feet

## Rendering

### Atmosphere/haze

- Custom shader or fog that increases with distance from camera
- Tuned so:
  - Local terrain (< 10 km): crisp and clear
  - Mid-distance (100-1000 km): slight haze
  - Far continents (5000+ km): visible but atmospheric, faded
- Physically unrealistic (real atmosphere would obscure everything) but artistically correct

### Lighting

- Ambient light sufficient to see everything
- Optional soft directional light for terrain definition
- No visible light source (sun sphere) initially
- Shadows optional - may add depth or may be confusing, experiment

### Water/oceans

- Start with flat blue colour matching Blue Marble texture
- Reflections are a stretch goal (would show opposite continents, could be stunning)

## Location Selection

Criteria:
- Coastal (beach/ocean is simpler than dense forest)
- Interesting local topography
- Good satellite imagery coverage
- Natural, not urban

Suggestions (in rough priority):
1. **Great Ocean Road, Australia** - dramatic coastline, good data
2. **Big Sur, California** - iconic coastal cliffs
3. **Somewhere in New Zealand** - mountains meeting sea
4. Or just pick a pretty beach with decent Mapbox coverage

The specific location is tweakable - build the system to accept a lat/lon and fetch appropriate tiles.

## Implementation Phases

### Phase 1: Proof of concept
- Hardcoded test location
- Global inverted sphere with Blue Marble texture (no displacement yet)
- Simple heightmap local terrain from Mapbox
- Basic mouselook controls
- Ambient lighting only

### Phase 2: Polish
- Add heightmap displacement to global sphere
- Atmospheric haze shader
- Better lighting
- Tune visual balance between local and global

### Phase 3: Stretch goals
- Location picker (lat/lon input, refetches tiles)
- Water reflections
- Static high-res 360° export (equirectangular image)
- Day/night or multiple lighting presets

## Technical Notes

### Sphere inversion
- Generate sphere geometry with `side: THREE.BackSide` or invert normals manually
- Or use negative scale on the sphere object

### Scale management
- Earth radius is 6,371 km - need to decide on scene units
- Suggest: 1 unit = 1 km, so sphere radius = 6371
- Camera near/far planes need to handle both close terrain and distant continents

### Tile math
- Mapbox tiles are in Web Mercator (EPSG:3857)
- Need to project back to lat/lon, then onto sphere surface
- Or: treat local terrain as flat (it's only a few km, curvature negligible) and just position it correctly on the sphere

### Seams
- Where local terrain meets global sphere, there may be visible discontinuity
- Options: blend at edges, or just accept it for v1

## File Structure

```
/src
  /lib
    terrain.js      # Mapbox tile fetching and mesh generation
    globe.js        # Inverted Earth sphere
    atmosphere.js   # Haze/fog shader
    controls.js     # Modified camera controls
  main.js           # Scene setup, render loop
/public
  /textures         # Downloaded Blue Marble, ETOPO, etc.
index.html
```

## Environment & API Keys

- Mapbox API key needed - store in `.env` or config file
- All other data sources are static downloads

## Output

A web page that:
1. Loads in browser
2. Shows the inverted Earth view from a fixed point
3. Allows looking around with mouse
4. Runs at reasonable framerate (doesn't need to be 60fps, it's art)
