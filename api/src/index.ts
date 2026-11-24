import Fastify from 'fastify';
import { ApiRouter } from './routes/router.ts';
import { registerUiStatic, resolveUiDistDir } from './static.ts';

// Allow overriding bind address and port via environment variables for multi-instance or test runs
const port = Number.parseInt(process.env.PORT ?? '3777', 10) || 3777;
const host = process.env.HOST?.trim() || '127.0.0.1';

const fastify = Fastify({
  logger: true,
  pluginTimeout: 60_000,
});

// Mount all REST, WebSocket, and MCP endpoints under /api
fastify.register(ApiRouter, { prefix: '/api' });

// Serve the built React UI from the same origin so REST and WS calls work without CORS
const uiDistDir = resolveUiDistDir(import.meta.dirname);
if (uiDistDir) {
  registerUiStatic(fastify, uiDistDir);
} else {
  fastify.log.warn('Built UI directory (ui/dist) not found; serving API only');
}

// Close Fastify cleanly so the onClose hook shuts down all managed Puppeteer browsers
const shutdown = async () => {
  try {
    await fastify.close();
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

fastify.listen({ port, host }, function (err) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
