import type { FastifyInstance } from 'fastify'

export function router(fastify: FastifyInstance) {
    fastify.get('/', function (request, reply) {
        reply.send({ hello: 'world' })
    })
}