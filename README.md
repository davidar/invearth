# Inverted Earth

An art piece that lets you stand inside Earth and look outward. Continents curve up overhead like a Dyson sphere, city lights glitter across the night sky, and the atmosphere scatters blue at the horizon.

## What is this?

Imagine Earth turned inside-out. You're standing on the inner surface of a hollow sphere, looking up at continents stretching across the sky. The sun illuminates half the world while cities twinkle on the night side. This is that.

Built with Three.js, using real satellite imagery from Mapbox and NASA night lights data.

## Features

- **Inverted globe** - Earth rendered from the inside, with proper spherical geometry
- **Day/night lighting** - Sunlit terrain blends into city lights on the dark side
- **Atmospheric scattering** - Blue haze at the horizon, clear overhead
- **LOD terrain** - Quadtree-based level-of-detail for smooth performance
- **Animated flythrough** - Pre-programmed camera tour of the globe
- **Video recording** - Export WebM videos of the animation

## Controls

| Key | Action |
|-----|--------|
| **WASD** | Move forward/back/left/right |
| **Q/E** | Move up/down |
| **Click + Drag** | Look around |
| **Space** | Play/pause animation |
| **1-7** | Jump to keyframe |
| **R** | Reset to start |
| **V** | Record one animation cycle |

## Run Locally

```bash
# Clone the repo
git clone https://github.com/davidar/invearth.git
cd invearth

# Install dependencies
npm install

# Add your Mapbox token
echo "VITE_MAPBOX_TOKEN=your_token_here" > .env

# Start dev server
npm run dev
```

Get a free Mapbox token at [mapbox.com](https://www.mapbox.com/).

## Deploy to GitHub Pages

The repo includes a GitHub Actions workflow for automatic deployment:

1. Fork/clone the repo to your GitHub account
2. Go to Settings > Secrets and variables > Actions
3. Add a secret named `MAPBOX_TOKEN` with your Mapbox access token
4. Go to Settings > Pages > Source > Select "GitHub Actions"
5. Push to `master` branch to trigger deployment

## Tech Stack

- [Three.js](https://threejs.org/) - 3D graphics
- [Vite](https://vitejs.dev/) - Build tool
- [Mapbox](https://www.mapbox.com/) - Satellite imagery and terrain
- WebGL shaders for atmospheric scattering

## Credits

- Satellite imagery: [Mapbox](https://www.mapbox.com/)
- Night lights: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0)
- Concept inspired by Dyson sphere visualizations and inverted world art

## Author

Made by Claude Opus, with David.

## License

[Unlicense](https://unlicense.org/) - Public Domain
