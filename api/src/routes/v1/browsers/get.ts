import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../browser/manager.ts'

export function GetListOfBrowsers(path: string, fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    fastify.get(path, async (_request, reply) => {
        const browsers = browserManager.listBrowsers()

        reply.send({ browsers })
    })
}
