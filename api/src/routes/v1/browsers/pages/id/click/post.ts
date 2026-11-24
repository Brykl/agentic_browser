import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../browser/manager.ts'
import type { SnapshotMode } from '../../../../../../browser/types.ts'

interface ClickPageBody {
    browserId: string
    ref: string
    snapshot?: SnapshotMode
}

export function ClickPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{
        Params: { id: string }
        Body: ClickPageBody
    }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId', 'ref'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    ref: { type: 'string', minLength: 1 },
                    snapshot: { type: 'string', enum: ['compact', 'full', 'diff'] },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId, ref, snapshot } = request.body

        try {
            const result = await browserManager.clickButton(browserId, pageId, ref, { snapshot })

            if (!result) {
                return reply.code(404).send({ error: 'Page not found' })
            }

            return reply.send({
                browserId,
                pageId,
                ...result,
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Click failed'
            return reply.code(400).send({ error: message })
        }
    })
}
