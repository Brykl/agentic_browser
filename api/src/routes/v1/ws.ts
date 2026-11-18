import type { FastifyInstance } from 'fastify'
import { NewWsServer } from '../../ws/server.ts'
import { BaseImg, GetImages } from '../../ws/image.ts'
import type { Browser } from 'puppeteer'
import  {ScrenCast, type BrowserManager } from '../../services/browser.ts'


export async function WsRouteV1(fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
    const pageId = browserManager.createBrowser

    // await page.setViewport({ width: 1280, height: 720 })
    // await page.goto('https://til-uiren.qazaq-learn.workers.dev/')


    const wss = NewWsServer({
        server: fastify.server,
        path: '/api/v1/ws',
    })

    wss.on('connection', async (socket, req) => {
        socket.on('error', (error) => fastify.log.error(error))
        
        const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
        const browserId = url.searchParams.get('browserId')
        const pageId = url.searchParams.get('pageId')

        if (!browserId || !pageId) {
        socket.close(1008, 'Missing browserId or pageId query parameter')
        return
        }

        const page = browserManager.getPage(browserId, pageId)
        if (!page) {
        socket.close(1008, 'Browser or page not found')
        return
        }

        const cast = await ScrenCast(page);
        setInterval(() => {
            const frame = cast.getFrame();
            socket.send(JSON.stringify({
                type: "base64",
                img: frame,
            }))

            // index = (index + 1) % encodedImages.length
        }, 333);
        // socket.on('message', (data) => {
        //     socket.send(`Получено: ${data.toString()}`)
        // })
    })

    fastify.addHook('onClose', () => {
        for (const socket of wss.clients) {
            socket.terminate()
        }

        return new Promise<void>((resolve, reject) => {
            wss.close((error) => {
                if (error) reject(error)
                else resolve()
            })
        })
    })
}
