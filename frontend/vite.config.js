import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, proxy /api/* to the Firebase Functions emulator.
    // Run: firebase emulators:start --only functions
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001/master-user-management/europe-west2',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          // Forward cookies so session-cookie auth works against the emulator
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.headers.cookie) {
              proxyReq.setHeader('Cookie', req.headers.cookie);
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
