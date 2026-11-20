import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../browser/manager.ts'

interface ReloadPageBody {
    browserId: string
}

export function ReloadPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{
        Params: { id: string }
        Body: ReloadPageBody
    }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId } = request.body

        try {
            const reloaded = await browserManager.reloadPage(browserId, pageId)

            if (!reloaded) {
                return reply.code(404).send({ error: 'Page not found' })
            }

            return reply.send({
                browserId,
                pageId,
                reloaded: true,
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Reload failed'
            return reply.code(400).send({ error: message })
        }
    })
}
