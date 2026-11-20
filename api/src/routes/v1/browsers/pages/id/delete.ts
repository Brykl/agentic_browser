import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../browser/manager.ts'

export function DeletePage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.delete<{
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

        const deleted = await browserManager.deletePage(browserId, pageId)

        if (!deleted) {
            return reply.code(404).send({ error: 'Page not found' })
        }

        return reply.send({
            browserId,
            pageId,
            deleted: true,
        })
    })
}
