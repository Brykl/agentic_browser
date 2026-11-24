import { describe, expect, test } from '@jest/globals'
import Fastify from 'fastify'
import { BrowserManager } from '../../../browser/manager.ts'
import type { BrowserDriver, BrowserEngine } from '../../../browser/types.ts'
import { BrowsersRoutesV1 } from './browser.ts'

function createFakeEngine() {
    let closeCalls = 0
    const engine: BrowserEngine = {
        name: 'fake',
        async launch(): Promise<BrowserDriver> {
            let connected = true
            let disconnectedCb: (() => void) | undefined
            return {
                async newPage() {
                    throw new Error('not implemented')
                },
                async close() {
                    closeCalls += 1
                    connected = false
                    disconnectedCb?.()
                },
                isConnected() {
                    return connected
                },
                onDisconnected(cb) {
                    disconnectedCb = cb
                },
            }
        },
    }
    return { engine, getCloseCalls: () => closeCalls }
}

describe('DELETE /api/v1/browsers/:id', () => {
    test('closes an existing browser session and returns 200', async () => {
        const { engine, getCloseCalls } = createFakeEngine()
        const browserManager = new BrowserManager([engine])
        const app = Fastify()
        await app.register(BrowsersRoutesV1, { prefix: '/api/v1/browsers', browserManager })

        const browserId = await browserManager.createBrowser('owner-1', {})
        expect(browserManager.hasBrowser(browserId)).toBe(true)

        const res = await app.inject({
            method: 'DELETE',
            url: `/api/v1/browsers/${browserId}`,
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ browserId, deleted: true })
        expect(browserManager.hasBrowser(browserId)).toBe(false)
        expect(getCloseCalls()).toBe(1)

        // Deleting again returns 404
        const resAgain = await app.inject({
            method: 'DELETE',
            url: `/api/v1/browsers/${browserId}`,
        })
        expect(resAgain.statusCode).toBe(404)
        expect(resAgain.json()).toEqual({ error: 'Browser not found' })

        await app.close()
    })

    test('returns 404 for unknown browser ID', async () => {
        const { engine } = createFakeEngine()
        const browserManager = new BrowserManager([engine])
        const app = Fastify()
        await app.register(BrowsersRoutesV1, { prefix: '/api/v1/browsers', browserManager })

        const res = await app.inject({
            method: 'DELETE',
            url: '/api/v1/browsers/non-existent',
        })

        expect(res.statusCode).toBe(404)
        expect(res.json()).toEqual({ error: 'Browser not found' })

        await app.close()
    })
})
