import type { FastifyInstance } from 'fastify'
import { NewWsServer } from '../../ws/server.ts'
import type { BrowserManager } from '../../browser/manager.ts'

export async function WsRouteV1(fastify: FastifyInstance, { browserManager }: { browserManager: BrowserManager }) {
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

        let cast;
        try {
            cast = await browserManager.startScreencast(browserId, pageId)
        } catch (error) {
            fastify.log.error(error, 'Failed to start screencast')
            socket.close(1011, 'Failed to start screencast')
            return
        }
        if (!cast) {
            socket.close(1008, 'Browser or page not found')
            return
        }

        if (socket.readyState !== socket.OPEN) {
            await cast.stop()
            return
        }

        const sendLatestFrame = () => {
            if (socket.readyState !== socket.OPEN) return;
            const frame = cast.getFrame();
            if (!frame) return;
            socket.send(JSON.stringify({
                type: "base64",
                img: frame,
            }))
        };

        sendLatestFrame();
        const interval = setInterval(sendLatestFrame, 100);

        socket.on('close', () => {
            clearInterval(interval);
            void cast.stop().catch(() => { });
        });
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
