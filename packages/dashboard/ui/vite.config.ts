import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  build: {
    outDir: '../dist-ui',
    emptyDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:18800',
    },
  },
});
