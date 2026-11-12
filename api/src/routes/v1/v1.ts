import type { FastifyInstance } from 'fastify'
import { McpRouteV1 } from './mcp.ts'

export async function RouterV1(fastify: FastifyInstance) {
    fastify.get('/', function (request, reply) {
        reply.send({ hello: 'world' })
    })

    fastify.register(McpRouteV1, { prefix: '/mcp' })
}