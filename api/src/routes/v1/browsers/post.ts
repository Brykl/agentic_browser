import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../browser/manager.ts'

interface CreateBrowserBody {
    ownerId: string
    headless?: boolean
    engine?: string
    humanize?: boolean
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
                    engine: { type: 'string', enum: browserManager.listEngines() },
                    humanize: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        const { ownerId, headless = true, engine, humanize } = request.body

        const browserId = await browserManager.createBrowser(ownerId, { headless, engine, humanize })

        return reply.code(201).send({ browserId })
    })
}
