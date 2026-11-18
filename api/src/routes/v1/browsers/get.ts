import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../services/browser.ts'

export function GetListOfBrowsers(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.get(path, async (request, reply) => {
        const browsers = Array.from(
            browserManager.getBrowsers().entries(),
            ([id, session]) => ({
                id,
                ownerId: session.ownerId,
                lastUsed: session.lastUsed,
                pageIds: [...session.pages.keys()],
            })
        )

        reply.send({ browsers })
    })
}
