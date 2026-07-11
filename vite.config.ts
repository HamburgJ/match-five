import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_URL || (process.env.CF_PAGES ? '/match-five/' : '/'),
  envPrefix: ['VITE_', 'CF_'],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
