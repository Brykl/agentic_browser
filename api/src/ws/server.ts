import { WebSocketServer } from 'ws'
import type { ServerOptions } from 'ws'

export function NewWsServer(options: ServerOptions): WebSocketServer {
    return new WebSocketServer(options)
}
