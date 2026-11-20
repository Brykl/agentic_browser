import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../browser/manager.ts'

export function GetPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.get<{
        Params: { id: string }
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
        const { id: pageId } = request.params
        const { browserId } = request.query

        const pageInfo = await browserManager.getPageInfo(browserId, pageId)

        if (!pageInfo) {
            return reply.code(404).send({ error: 'Page not found' })
        }

        return reply.send(pageInfo)
    })
}
