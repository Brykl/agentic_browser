import type { FastifyInstance } from 'fastify'
import { RouterV1 } from './v1/v1.ts'
import { BrowserManager } from '../services/browser.ts'
import { WsRouteV1 } from './v1/ws.ts';

export const DEFAULT_BROWSER_ID = "18c38237-e214-4e9e-a3d9-05193b95837a";
export const DEFAULT_PAGE_ID = "269cb5c2-0de6-4447-9ec1-620e7e117cf5";

export async function ApiRouter(fastify: FastifyInstance) {
    const browserManager = new BrowserManager();

    // Pre-create a default browser and blank page on startup so the UI and CLI work immediately;
    // avoid external network requests at boot unless AGENTIC_BROWSER_DEFAULT_URL is explicitly set.
    fastify.addHook('onListen', async () => {
        const headlessEnv = process.env.AGENTIC_BROWSER_HEADLESS?.trim().toLowerCase();
        const headless = headlessEnv !== 'false' && headlessEnv !== '0';
        const defaultUrl = process.env.AGENTIC_BROWSER_DEFAULT_URL?.trim();

        try {
            await browserManager.createBrowser("system", { headless }, DEFAULT_BROWSER_ID);
            await browserManager.createPage(
                DEFAULT_BROWSER_ID,
                defaultUrl ? { url: defaultUrl } : undefined,
                DEFAULT_PAGE_ID,
            );
            fastify.log.info({ browserId: DEFAULT_BROWSER_ID, pageId: DEFAULT_PAGE_ID, headless }, 'Default browser and page initialized');
        } catch (err) {
            fastify.log.error(err, 'Failed to initialize default browser and page');
        }
    })

    fastify.addHook('onClose', async () => {
        await browserManager.closeAll()
    })

    fastify.register(RouterV1, { prefix: '/v1', browserManager })
    fastify.register(WsRouteV1, { prefix: '/v1', browserManager })
}
