import type { FastifyInstance } from 'fastify'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { NewMcpServer } from '../../mcp/server.ts'
import type { Browser } from 'puppeteer'


export async function McpRouteV1(fastify: FastifyInstance, { browser }: { browser: Browser }) {
    const mcp = createMcpHandler(() => NewMcpServer(browser))
    const handleMcp = toNodeHandler(mcp)

    fastify.addHook('onClose', async () => {
        await mcp.close()
    })

    fastify.all('/', async (request, reply) => {
        reply.hijack()
        await handleMcp(request.raw, reply.raw, request.body)
    })
}
