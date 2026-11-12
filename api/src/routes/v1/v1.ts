import type { FastifyInstance } from 'fastify'
import { McpRouteV1 } from './mcp.ts'
import type { Browser } from 'puppeteer'

export async function RouterV1(fastify: FastifyInstance, { browser }: { browser: Browser }) {
    fastify.get('/', function (request, reply) {
        reply.send({ hello: 'world' })
    })

    fastify.register(McpRouteV1, { prefix: '/mcp', browser })
}
