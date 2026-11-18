import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../services/browser.ts'

interface CreatePageBody {
    browserId: string
    pageUrl?: string
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
                },
            },
        },
    }, async (request, reply) => {
        const { browserId, pageUrl = 'https://google.com' } = request.body

        const pageId = await browserManager.createPage(browserId, { url: pageUrl })
        if (!pageId) {
            return reply.code(500).send('Failed create page')
        }
        return reply.code(201).send({ pageId })
    })
}
