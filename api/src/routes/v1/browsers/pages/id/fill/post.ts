import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../browser/manager.ts'

interface FillPageBody {
    browserId: string
    ref: string
    value: string
}

export function FillPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{
        Params: { id: string }
        Body: FillPageBody
    }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId', 'ref', 'value'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    ref: { type: 'string', minLength: 1 },
                    value: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId, ref, value } = request.body

        try {
            const result = await browserManager.fillForm(browserId, pageId, ref, value)

            if (!result) {
                return reply.code(404).send({ error: 'Page not found' })
            }

            return reply.send({
                browserId,
                pageId,
                ...result,
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Fill failed'
            return reply.code(400).send({ error: message })
        }
    })
}
