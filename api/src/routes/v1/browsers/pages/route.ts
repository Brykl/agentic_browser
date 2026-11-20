import type { FastifyInstance } from 'fastify'
import type { BrowserManager } from '../../../../browser/manager.ts'
import { GetListOfPages } from './get.ts'
import { CreatePage } from './post.ts'
import { GetPage } from './id/get.ts'
import { UpdatePage } from './id/patch.ts'
import { DeletePage } from './id/delete.ts'
import { GetPageSnapshot } from './id/snapshot/get.ts'
import { ClickPage } from './id/click/post.ts'
import { FillPage } from './id/fill/post.ts'
import { GetPageScroll } from './id/scroll/get.ts'
import { ScrollPage } from './id/scroll/post.ts'
import { ReloadPage } from './id/reload/post.ts'

export async function PagesRoutesV1(fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    GetListOfPages('/', fastify, { browserManager })
    CreatePage('/', fastify, { browserManager })
    GetPage('/:id', fastify, { browserManager })
    UpdatePage('/:id', fastify, { browserManager })
    GetPageSnapshot('/:id/snapshot', fastify, { browserManager })
    ClickPage('/:id/click', fastify, { browserManager })
    FillPage('/:id/fill', fastify, { browserManager })
    GetPageScroll('/:id/scroll', fastify, { browserManager })
    ScrollPage('/:id/scroll', fastify, { browserManager })
    ReloadPage('/:id/reload', fastify, { browserManager })
    DeletePage('/:id', fastify, { browserManager })
}
