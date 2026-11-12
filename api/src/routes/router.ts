import type { FastifyInstance } from 'fastify'
import { RouterV1 } from './v1/v1.ts'
import { WsRouteV1 } from './v1/ws.ts'
import { RunVirtualBrowser } from '../browser/manager.ts'

export async function ApiRouter(fastify: FastifyInstance) {
    const browser = await RunVirtualBrowser({ headless: true })

    fastify.addHook('onClose', async () => {
        await browser.close()
    })

    fastify.register(RouterV1, { prefix: '/v1', browser })
    fastify.register(WsRouteV1, { prefix: '/v1', browser })
}
