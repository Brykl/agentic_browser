import type { FastifyInstance } from 'fastify'
import { McpRouteV1 } from './mcp.ts'
import type { BrowserManager } from '../../browser/manager.ts'
import { BrowsersRoutesV1 } from './browsers/browser.ts'

export async function RouterV1(fastify: FastifyInstance, { browserManager, isReady }: { browserManager: BrowserManager, isReady: () => boolean }) {
    // Lightweight readiness endpoint checked by the CLI/agent before starting a duplicate server
    fastify.get('/health', async () => {
        return { ok: true, ready: isReady() }
    })

    fastify.register(McpRouteV1, { prefix: '/mcp', browserManager })
    fastify.register(BrowsersRoutesV1, { prefix: '/browsers', browserManager })
}
