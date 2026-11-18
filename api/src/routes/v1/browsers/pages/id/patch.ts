import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../../services/browser.ts'

interface UpdatePageBody {
    browserId: string
    pageUrl: string
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
                },
            },
        },
    }, async (request, reply) => {
        const { id: pageId } = request.params
        const { browserId, pageUrl } = request.body

        const page = await browserManager.updatePageUrl(browserId, pageId, pageUrl)

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
