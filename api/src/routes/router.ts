import type { FastifyInstance } from 'fastify'
import { RouterV1 } from './v1/v1.ts'
import { WsRouteV1 } from './v1/ws.ts'

export async function ApiRouter(fastify: FastifyInstance) {
    fastify.register(RouterV1, { prefix: '/v1' })
    fastify.register(WsRouteV1, { prefix: '/v1' })
}
