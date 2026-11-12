import type { FastifyInstance } from 'fastify'
import { McpRoute } from './mcp.ts'

export async function RouterV1(fastify: FastifyInstance) {
    fastify.get('/', function (request, reply) {
        reply.send({ hello: 'world' })
    })

    fastify.register(McpRoute, { prefix: '/mcp' })
}