import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../browser/manager.ts'

export function GetListOfPages(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.get<{
        Querystring: { browserId: string }
    }>(path, {
        schema: {
            querystring: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                },
            },
        },
    }, async (request, reply) => {
        const { browserId } = request.query

        if (!browserManager.hasBrowser(browserId)) {
            return reply.code(404).send({ error: 'Browser not found' })
        }

        const pages = browserManager.listPages(browserId)
        return reply.send({ browserId, pages })
    })
}