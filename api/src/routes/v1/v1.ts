import type { FastifyInstance } from 'fastify'
import { McpRouteV1 } from './mcp.ts'
import type { Browser } from 'puppeteer'
import type { BrowserManager } from '../../services/browser.ts'
import { BrowsersRoutesV1 } from './browsers/browser.ts'

export async function RouterV1(fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    // fastify.get('/', function (request, reply) {
    //     reply.send({ hello: 'world' })
    // })

    fastify.register(McpRouteV1, { prefix: '/mcp', browserManager })
    fastify.register(BrowsersRoutesV1, { prefix: '/browsers', browserManager })
}
