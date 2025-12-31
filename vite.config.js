import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages - repo name will be 'invearth'
  // Use '/' for local dev, '/invearth/' for production
  base: process.env.NODE_ENV === 'production' ? '/invearth/' : '/',

  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
