import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../browser/manager.ts'

export function GetPageSnapshot(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.get<{
        Params: { id: string }
        Querystring: { browserId: string; full?: boolean }
    }>(path, {
        schema: {
            querystring: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    full: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId, full } = request.query

        const snapshot = full
            ? await browserManager.fullSnapshotPage(browserId, pageId)
            : await browserManager.snapshotPage(browserId, pageId)

        if (snapshot === undefined) {
            return reply.code(404).send({ error: 'Page not found' })
        }

        return reply.send({
            browserId,
            pageId,
            snapshot,
        })
    })
}
