import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../services/browser.ts'

interface ScrollPageBody {
    browserId: string
    left?: number
    top?: number
}

export function ScrollPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{
        Params: { id: string }
        Body: ScrollPageBody
    }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                    left: { type: 'number', default: 0 },
                    top: { type: 'number', default: 0 },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId, left = 0, top = 0 } = request.body

        try {
            const result = await browserManager.scrollPage(browserId, pageId, left, top)

            if (!result) {
                return reply.code(404).send({ error: 'Page not found' })
            }

            return reply.send({
                browserId,
                pageId,
                ...result,
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Scroll failed'
            return reply.code(400).send({ error: message })
        }
    })
}
