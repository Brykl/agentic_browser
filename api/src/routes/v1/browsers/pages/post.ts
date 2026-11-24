import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../browser/manager.ts'
import type { SnapshotMode } from '../../../../browser/types.ts'

interface CreatePageBody {
    browserId: string
    pageUrl?: string
    snapshot?: SnapshotMode
}

export function CreatePage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{ Body: CreatePageBody }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    pageUrl: { type: 'string' },
                    snapshot: { type: 'string', enum: ['compact', 'full', 'diff'] },
                },
            },
        },
    }, async (request, reply) => {
        const { browserId, pageUrl = 'https://google.com', snapshot } = request.body

        const pageId = await browserManager.createPage(browserId, { url: pageUrl })
        if (!pageId) {
            return reply.code(500).send('Failed create page')
        }

        const meta = await browserManager.getPageActionMeta(browserId, pageId, { snapshot })
        return reply.code(201).send({
            browserId,
            pageId,
            ...(meta ?? {}),
        })
    })
}
