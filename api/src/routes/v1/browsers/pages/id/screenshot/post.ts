import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../../browser/manager.ts'

interface ScreenshotPageBody {
    browserId: string
}

export function ScreenshotPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{
        Params: { id: string }
        Body: ScreenshotPageBody
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
            const filePath = await browserManager.screenshotPage(browserId, pageId)

            if (filePath === undefined) {
                return reply.code(404).send({ error: 'Page not found' })
            }

            return reply.send({
                browserId,
                pageId,
                path: filePath,
            })
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Screenshot failed'
            return reply.code(400).send({ error: message })
        }
    })
}
