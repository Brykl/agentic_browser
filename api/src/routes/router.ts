import type { FastifyInstance } from 'fastify'
import { RouterV1 } from './v1/v1.ts'
import { BrowserManager } from '../services/browser.ts'
import { WsRouteV1 } from './v1/ws.ts';

export const DEFAULT_BROWSER_ID = "18c38237-e214-4e9e-a3d9-05193b95837a";
export const DEFAULT_PAGE_ID = "269cb5c2-0de6-4447-9ec1-620e7e117cf5";

export async function ApiRouter(fastify: FastifyInstance) {
    const browserManager = new BrowserManager();

    await browserManager.createBrowser("system", { headless: true }, DEFAULT_BROWSER_ID);
    await browserManager.createPage(DEFAULT_BROWSER_ID, { url: "https://example.com" }, DEFAULT_PAGE_ID);

    fastify.addHook('onClose', async () => {
        await browserManager.closeAll()
    })

    fastify.register(RouterV1, { prefix: '/v1', browserManager })
    fastify.register(WsRouteV1, { prefix: '/v1', browserManager })
}
