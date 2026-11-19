import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** Resolve the built UI directory across compiled (`dist/`) and source (`api/src/`) layouts. */
export function resolveUiDistDir(baseDir: string): string | undefined {
  const candidates = [
    process.env.AGENTIC_BROWSER_UI_DIR?.trim(),
    // When running from compiled dist/index.js
    path.resolve(baseDir, '..', 'ui', 'dist'),
    // When running directly from api/src/index.ts in dev mode
    path.resolve(baseDir, '..', '..', 'ui', 'dist'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((dir) => existsSync(path.join(dir, 'index.html')));
}

// Guard against path traversal outside the static UI root
function isSubPath(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(rootDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function sendStaticFile(reply: FastifyReply, filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
  // Keep index.html uncached so new builds take effect immediately; cache fingerprinted assets aggressively
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  const data = await readFile(filePath);
  return reply.type(contentType).header('Cache-Control', cacheControl).send(data);
}

/** Register static UI file serving and SPA fallback for non-`/api` GET/HEAD routes. */
export function registerUiStatic(fastify: FastifyInstance, uiDistDir: string) {
  const rootDir = path.resolve(uiDistDir);
  const indexHtml = path.join(rootDir, 'index.html');

  const serveUi = async (rawUrl: string, reply: FastifyReply) => {
    const pathname = decodeURIComponent(rawUrl.split('?', 1)[0] ?? '/');
    // Never fall back to index.html for unknown /api routes
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not Found' });
    }

    const relPath = pathname.replace(/^\/+/, '');
    const candidate = path.resolve(rootDir, relPath || 'index.html');
    if (!isSubPath(rootDir, candidate)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        return await sendStaticFile(reply, candidate);
      }
    } catch {
      // Fall through to asset 404 or SPA index.html
    }

    // Missing files with an extension (e.g. .js/.css/.png) should 404 rather than return HTML
    if (path.extname(pathname)) {
      return reply.code(404).send({ error: 'Not Found' });
    }

    return await sendStaticFile(reply, indexHtml);
  };

  fastify.get('/', async (request, reply) => serveUi(request.url, reply));
  fastify.get('/*', async (request, reply) => serveUi(request.url, reply));
}
