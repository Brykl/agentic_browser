import type { FastifyInstance } from 'fastify'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { NewMcpServer } from '../../mcp/server.ts'
import type { Browser } from 'puppeteer'
import type { BrowserManager } from '../../services/browser.ts'
import { id } from 'zod/locales'



export async function BrowsersRoutesV1(fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {


    fastify.get('/', async (request, reply) => {
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

    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
        const { id } = request.params

    })

    fastify.post<{ Body: CreateBrowserBody }>('/',
        {
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
        },
        async (request, reply) => {
            const { ownerId, headless = true } = request.body

            const browserId = await browserManager.createBrowser(ownerId, { headless })

            return reply.code(201).send({ browserId })
        })
}


interface CreateBrowserBody {
    ownerId: string
    headless?: boolean
}

interface GetBrowsersOutput {

}