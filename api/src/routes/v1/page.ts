import type { FastifyInstance } from 'fastify'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { NewMcpServer } from '../../mcp/server.ts'
import type { Browser } from 'puppeteer'
import type { BrowserManager } from '../../services/browser.ts'
import { id } from 'zod/locales'
import { url } from 'inspector'
import { title } from 'process'



export async function PagesRoutesV1(fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {

    fastify.post<{ Body: CreatePageBody }>('/', {
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
        const { browserId, pageUrl = "https://google.com" } = request.body

        const pageId = await browserManager.createPage(browserId, { url: pageUrl })
        if (!pageId) {
            return reply.code(500).send("Failed create page")
        }
        return reply.code(201).send(`Successfully created page with id:"${pageId}"`)
    }
    )

    fastify.get<{
        Params: { id: string }
        Querystring: { browserId: string }
    }>('/:id',
        {
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

interface CreatePageBody {
    browserId: string,
    pageUrl?: string,
}