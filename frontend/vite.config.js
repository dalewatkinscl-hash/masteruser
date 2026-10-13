import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Emit /version.json + bake VITE_APP_BUILD_ID so open tabs can force-refresh after deploy. */
function deployVersionPlugin() {
  const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: 'deploy-version',
    config() {
      return {
        define: {
          'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(buildId),
        },
      };
    },
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir || path.resolve('dist');
      const payload = {
        buildId,
        builtAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(outDir, 'version.json'), `${JSON.stringify(payload)}\n`, 'utf8');
    },
  };
}

/**
 * Local-only mock for Country Lion Reports when REPORTS_DEMO=1.
 * Bypasses Firebase so the portal UI can be demoed without secrets.
 */
function reportsDemoPlugin(enabled) {
  return {
    name: 'reports-demo-api',
    configureServer(server) {
      if (!enabled) return;

      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://127.0.0.1');
          if (!url.pathname.startsWith('/api/')) return next();

          const mockPath = path.resolve(__dirname, '../scripts/reportsDemoMock.mjs');
          const mock = await import(pathToFileURL(mockPath).href);
          const deny = url.searchParams.get('demoAccess') === 'denied'
            || req.headers['x-demo-access'] === 'denied';

          if (url.pathname === '/api/verifyUserSession' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ user: mock.buildDemoUser({ allowReports: !deny }) }));
            return;
          }

          if (url.pathname === '/api/getFinanceReports' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            if (deny) {
              res.statusCode = 403;
              res.end(JSON.stringify({
                error: 'You do not have access to Country Lion Reports. Ask an admin to grant Finance reports.',
              }));
              return;
            }
            const payload = await mock.getDemoFinancePayload({
              period: url.searchParams.get('period') || '12m',
              depot: url.searchParams.get('depot') || 'All',
              segment: url.searchParams.get('segment') || 'All',
              from: url.searchParams.get('from') || undefined,
              to: url.searchParams.get('to') || undefined,
            });
            res.end(JSON.stringify(payload));
            return;
          }

          // Soft-stub other APIs so the shell does not hard-fail in demo mode.
          if (url.pathname.startsWith('/api/')) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Not available in REPORTS_DEMO mode.' }));
            return;
          }
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Demo middleware failed',
          }));
          return;
        }

        return next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const reportsDemo = env.REPORTS_DEMO === '1' || process.env.REPORTS_DEMO === '1';

  return {
    plugins: [react(), deployVersionPlugin(), reportsDemoPlugin(reportsDemo)],
    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT || 43129),
      // In normal dev, proxy /api/* to the Firebase Functions emulator.
      // When REPORTS_DEMO=1 the plugin above handles Reports APIs instead.
      proxy: reportsDemo
        ? undefined
        : {
            '/api': {
              target: 'http://127.0.0.1:5001/master-user-management/europe-west2',
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/api/, ''),
              configure: (proxy) => {
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('three')) return 'vendor-three';
            if (id.includes('leaflet') || id.includes('mapillary')) return 'vendor-maps';
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
              return 'vendor-react';
            }
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
  };
});
