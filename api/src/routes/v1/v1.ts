import type { FastifyInstance } from 'fastify'

export async function RouterV1(fastify: FastifyInstance) {
    fastify.get('/', function (request, reply) {
        reply.send({ hello: 'world' })
    })
}