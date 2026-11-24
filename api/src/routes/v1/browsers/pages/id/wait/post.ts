import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../browser/manager.ts'
import type { PageLoadState, SnapshotMode } from '../../../../../../browser/types.ts'
import { MAX_WAIT_TIMEOUT_MS, WaitTimeoutError } from '../../../../../../browser/wait.ts'

interface WaitPageBody {
    browserId: string
    url?: string
    text?: string
    load?: PageLoadState
    timeout?: number
    snapshot?: SnapshotMode
}

export function WaitPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{
        Params: { id: string }
        Body: WaitPageBody
    }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    url: { type: 'string', minLength: 1 },
                    text: { type: 'string', minLength: 1 },
                    load: { type: 'string', enum: ['domcontentloaded', 'load', 'networkidle'] },
                    timeout: { type: 'integer', minimum: 100, maximum: MAX_WAIT_TIMEOUT_MS },
                    snapshot: { type: 'string', enum: ['compact', 'full', 'diff'] },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId, url, text, load, timeout, snapshot } = request.body

        if (!url && !text && !load) {
            return reply.code(400).send({
                error: 'At least one wait condition (url, text, or load) must be provided',
            })
        }

        try {
            const result = await browserManager.waitPage(
                browserId,
                pageId,
                { url, text, load, timeout },
                { snapshot },
            )

            if (!result) {
                return reply.code(404).send({ error: 'Page not found' })
            }

            return reply.send({
                browserId,
                pageId,
                ...result,
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Wait failed'
            if (err instanceof WaitTimeoutError) {
                return reply.code(408).send({ error: message })
            }
            return reply.code(400).send({ error: message })
        }
    })
}
