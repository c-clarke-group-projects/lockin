import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_URL = 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // The app calls /api and /ws on its own address and Vite forwards them, so a
    // phone on the same network only needs the frontend address.
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true },
      '/ws': { target: BACKEND_URL.replace(/^http/, 'ws'), ws: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
  },
});

