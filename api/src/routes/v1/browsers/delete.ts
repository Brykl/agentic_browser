import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../browser/manager.ts'

export function DeleteBrowser(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.delete<{
        Params: { id: string }
    }>(path, {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string', minLength: 1 },
                },
            },
        },
    }, async (request, reply) => {
        const { id: browserId } = request.params

        const deleted = await browserManager.closeBrowser(browserId)

        if (!deleted) {
            return reply.code(404).send({ error: 'Browser not found' })
        }

        return reply.send({
            browserId,
            deleted: true,
        })
    })
}
