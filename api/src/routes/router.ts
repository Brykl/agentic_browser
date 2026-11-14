import type { FastifyInstance } from 'fastify'
import { RouterV1 } from './v1/v1.ts'
// import { WsRouteV1 } from './v1/ws.ts'
import { BrowserManager } from '../browser/manager.ts'

export async function ApiRouter(fastify: FastifyInstance) {
    const browserManager = new BrowserManager();

    fastify.addHook('onClose', async () => {
        await browserManager.closeAll()
    })

    fastify.register(RouterV1, { prefix: '/v1', browserManager })
    // fastify.register(WsRouteV1, { prefix: '/v1', browserManager })
}
