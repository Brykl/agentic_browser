import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../browser/manager.ts'
import type { SnapshotMode } from '../../../../../browser/types.ts'

interface UpdatePageBody {
    browserId: string
    pageUrl: string
    snapshot?: SnapshotMode
}

export function UpdatePage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.patch<{
        Params: { id: string }
        Body: UpdatePageBody
    }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId', 'pageUrl'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    pageUrl: { type: 'string', minLength: 1 },
                    snapshot: { type: 'string', enum: ['compact', 'full', 'diff'] },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId, pageUrl, snapshot } = request.body

        const pageInfo = await browserManager.updatePageUrl(browserId, pageId, pageUrl, { snapshot })

        if (!pageInfo) {
            return reply.code(404).send({ error: 'Page not found' })
        }

        return reply.send(pageInfo)
    })
}
