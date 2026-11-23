import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApiRouter, UPLOAD_DIR } from './src/server/routes.ts';
import { setupWebSocketServer } from './src/server/realtime.ts';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Path-traversal-safe media file serving
  app.get('/uploads/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    const resolvedPath = path.resolve(UPLOAD_DIR, safeName);
    if (!resolvedPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'Media asset not found' });
    }
    res.sendFile(resolvedPath);
  });

  app.use('/api', createApiRouter());

  const server = http.createServer(app);
  setupWebSocketServer(server);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Kartini Exam Portal server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
