import type { FastifyInstance } from 'fastify'
import { NewWsServer } from '../../ws/server.ts'


export async function WsRouteV1(fastify: FastifyInstance) {
    const wss = NewWsServer({
        server: fastify.server,
        path: '/api/v1/ws',
    })

    wss.on('connection', (socket) => {
        socket.on('error', (error) => fastify.log.error(error))
        setInterval(() => {

            socket.send(JSON.stringify({
                text: "Прошла 1 секунда"
            }))
        }, 1000);
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
