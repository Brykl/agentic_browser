import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../services/browser.ts'

export function GetPageSnapshot(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
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

        const snapshot = await browserManager.snapshotPage(browserId, pageId)

        if (!snapshot) {
            return reply.code(404).send({ error: 'Page not found' })
        }

        return reply.send({
            browserId,
            pageId,
            snapshot,
        })
    })
}
