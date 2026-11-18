import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../services/browser.ts'

export function GetPage(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.get<{
        Params: { id: string }
        Querystring: { browserId: string }
    }>(path, {
        schema: {
            querystring: {
                type: 'object',
                required: ['browserId'],
                properties: {
                    browserId: { type: 'string', minLength: 1 },
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId } = request.query

        const page = browserManager.getPage(browserId, pageId)

        if (!page) {
            return reply.code(404).send({ error: 'Page not found' })
        }

        return reply.send({
            browserId,
            pageId,
            url: page.url(),
            title: await page.title(),
        })
    })
}
