import type { FastifyInstance } from 'fastify'
import { NewWsServer } from '../../ws/server.ts'
import { parseClientMessage, type ClientMessage } from '../../ws/client-message.ts'
import type { BrowserManager } from '../../browser/manager.ts'
import type { FrameStream } from '../../browser/types.ts'

/** Consecutive messages of these kinds can be merged into one while still waiting in the queue. */
function mergeMessages(prev: ClientMessage, next: ClientMessage): ClientMessage | null {
    if (prev.t === 'mouse' && prev.kind === 'move' && next.t === 'mouse' && next.kind === 'move') {
        return next
    }
    if (prev.t === 'wheel' && next.t === 'wheel') {
        return { ...next, dx: prev.dx + next.dx, dy: prev.dy + next.dy }
    }
    if (prev.t === 'resize' && next.t === 'resize') {
        return next
    }
    return null
}

const isMergeable = (msg: ClientMessage) =>
    (msg.t === 'mouse' && msg.kind === 'move') || msg.t === 'wheel' || msg.t === 'resize'

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

        const sendJson = (payload: unknown) => {
            if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload))
        }

        // ---- Input -------------------------------------------------------------
        // Registered before any `await`: messages sent right after `onopen`
        // (e.g. the first `resize`) would otherwise be dropped by `ws`.

        // Messages are executed strictly one after another: a `down` must never
        // overtake the `move` that preceded it.
        let queue: Promise<void> = Promise.resolve()
        // Last queued message that has not started yet; only it may absorb new
        // messages, so merging never reorders events.
        let tail: { msg: ClientMessage } | null = null

        const execute = async (msg: ClientMessage) => {
            if (msg.t === 'resize') {
                const size = await browserManager.setViewport(browserId, pageId, msg.width, msg.height)
                if (size) sendJson({ type: 'viewport', ...size })
                return
            }
            const found = await browserManager.dispatchInput(browserId, pageId, msg)
            if (!found) socket.close(1008, 'Browser or page not found')
        }

        const enqueue = (msg: ClientMessage) => {
            if (tail) {
                const merged = mergeMessages(tail.msg, msg)
                if (merged) {
                    tail.msg = merged
                    return
                }
            }

            const slot = { msg }
            tail = isMergeable(msg) ? slot : null

            queue = queue
                .then(async () => {
                    if (tail === slot) tail = null
                    await execute(slot.msg)
                })
                .catch((err) => fastify.log.warn({ err, browserId, pageId }, 'WS input failed'))
        }

        socket.on('message', (raw, isBinary) => {
            try {
                if (isBinary) return
                const msg = parseClientMessage(raw.toString())
                if (msg) enqueue(msg)
            } catch (err) {
                fastify.log.warn({ err }, 'Failed to handle WS message')
            }
        })

        // ---- Screencast --------------------------------------------------------
        let cast: FrameStream | undefined
        let unsubscribeFrames: (() => void) | undefined

        socket.on('close', () => {
            unsubscribeFrames?.()
            void cast?.stop().catch(() => { })
            // Don't leave buttons/modifiers stuck if the UI disconnected mid-drag
            tail = null
            queue = queue
                .then(() => browserManager.releaseInput(browserId, pageId))
                .catch(() => { })
        })

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

        let lastSentFrame: Buffer | null = null

        const sendFrame = (frame: Buffer) => {
            if (socket.readyState !== socket.OPEN) return
            if (socket.bufferedAmount > 0) return
            if (frame === lastSentFrame) return
            lastSentFrame = frame
            socket.send(frame, { binary: true })
        }

        unsubscribeFrames = cast.onFrame(sendFrame)
        const initialFrame = cast.getFrame()
        if (initialFrame) sendFrame(initialFrame)
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
