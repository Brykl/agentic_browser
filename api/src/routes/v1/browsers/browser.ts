import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../services/browser.ts'
import { PagesRoutesV1 } from './pages/route.ts'
import { GetListOfBrowsers } from './get.ts'
import { CreateBrowser } from './post.ts'

export async function BrowsersRoutesV1(fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    GetListOfBrowsers('/', fastify, { browserManager })
    CreateBrowser('/', fastify, { browserManager })
    fastify.register(PagesRoutesV1, { prefix: '/pages', browserManager })
}
