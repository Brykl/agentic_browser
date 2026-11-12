import type { FastifyInstance } from 'fastify'
import { NewWsServer } from '../../ws/server.ts'
import { BaseImg, GetImages } from '../../ws/image.ts'
import { CreateNewPage, ScrenCast } from '../../browser/manager.ts'
import type { Browser } from 'puppeteer'


export async function WsRouteV1(fastify: FastifyInstance, { browser }: { browser: Browser }) {
    const page = await CreateNewPage(browser)

    await page.setViewport({ width: 1280, height: 720 })
    await page.goto('https://til-uiren.qazaq-learn.workers.dev/')


    const wss = NewWsServer({
        server: fastify.server,
        path: '/api/v1/ws',
    })

    wss.on('connection', async (socket) => {
        socket.on('error', (error) => fastify.log.error(error))
        // const imgs = await GetImages()
        // let encodedImages: string[] = imgs.map(BaseImg)
        // let index = 0
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
