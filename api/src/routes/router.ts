import type { FastifyInstance } from 'fastify'
import { RouterV1 } from './v1/v1.ts'
// import { BrowserManager } from '../services/browser.ts'
import { WsRouteV1 } from './v1/ws.ts';
import { BrowserManager } from '../browser/manager.ts';
import { PuppeteerEngine } from '../browser/engines/puppeteer/engine.ts';
import { CamoufoxEngine } from '../browser/engines/camoufox/engine.ts';
import type { BrowserLaunchConfig } from '../browser/types.ts';


export const DEFAULT_BROWSER_ID = "18c38237-e214-4e9e-a3d9-05193b95837a";
export const DEFAULT_PAGE_ID = "269cb5c2-0de6-4447-9ec1-620e7e117cf5";

export async function ApiRouter(fastify: FastifyInstance) {
    // const browserManager = new BrowserManager();
    let ready: boolean = false

    const humanizeEnv = (process.env.AGENTIC_BROWSER_HUMANIZE ?? process.env.BROWSER_HUMANIZE)?.trim().toLowerCase();
    const defaultHumanize = humanizeEnv === 'true' || humanizeEnv === '1';

    const browserManager = new BrowserManager(
        [
            new PuppeteerEngine(),
            new CamoufoxEngine(),
        ],
        process.env.BROWSER_ENGINE?.trim().toLowerCase() || 'camoufox',
        defaultHumanize,
    )

    fastify.addHook('onReady', async () => {
        const headlessEnv = (process.env.AGENTIC_BROWSER_HEADLESS ?? process.env.BROWSER_HEADLESS)?.trim().toLowerCase();
        const headless = headlessEnv !== 'false' && headlessEnv !== '0';
        const defaultUrl = process.env.AGENTIC_BROWSER_DEFAULT_URL?.trim() || "about:blank";

        try {
            const config: BrowserLaunchConfig = {
                headless,
                humanize: defaultHumanize,
            }
            const browserId = await browserManager.createBrowser("system", config, DEFAULT_BROWSER_ID)
            const pageId = await browserManager.createPage(
                browserId,
                defaultUrl ? { url: defaultUrl } : undefined,
                DEFAULT_PAGE_ID,
            );
            ready = true
            fastify.log.info(
                { browserId, pageId, headless: config.headless, humanize: config.humanize },
                'Default browser and page initialized',
            );
        } catch (err) {
            fastify.log.error(err, 'Failed to initialize default browser and page');
        }
    })

    fastify.addHook('onClose', async () => {
        await browserManager.closeAll()
    })

    fastify.register(RouterV1, { prefix: '/v1', browserManager, isReady: () => ready })
    fastify.register(WsRouteV1, { prefix: '/v1', browserManager })
}
