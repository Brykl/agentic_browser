import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../services/browser.ts'

interface CreateBrowserBody {
    ownerId: string
    headless?: boolean
}

export function CreateBrowser(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.post<{ Body: CreateBrowserBody }>(path, {
        schema: {
            body: {
                type: 'object',
                required: ['ownerId'],
                properties: {
                    ownerId: { type: 'string', minLength: 1 },
                    headless: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        const { ownerId, headless = true } = request.body

        const browserId = await browserManager.createBrowser(ownerId, { headless })

        return reply.code(201).send({ browserId })
    })
}
