import { randomInt } from 'node:crypto';
import type { CDPSession, Page } from 'puppeteer';
import type { Protocol } from 'puppeteer-core';
import type { FrameListener, FrameStream, PageDriver, InputEvent } from '../../types.ts';
import {
    IGNORED_KEYS,
    MOD_CTRL,
    MOD_META,
    MOUSE_BUTTONS,
    MOUSE_BUTTON_BITS,
    clampViewport,
    keyLocation,
    windowsKeyCode,
} from '../../input.ts';
import { compactAXTreeForLLM, optimizeAXTreeForLLM } from './ax-tree.ts';
import { nextScreenshotPath } from '../../screenshot.ts';
import { path } from "ghost-cursor";

export class PuppeteerPageDriver implements PageDriver {
    private readonly page: Page;
    private refMap = new Map<string, number>();
    /** Long-lived CDP session for UI input, created on first dispatchInput */
    private inputSession: Promise<CDPSession> | null = null;
    /** Mouse buttons currently held by the UI user (CDP `buttons` bitmask) */
    private heldButtons = 0;
    /** Last mouse position sent by the UI, used to release held buttons */
    private lastMouse = { x: 0, y: 0 };

    constructor(page: Page) {
        this.page = page;
        this.page.on('framenavigated', (frame) => {
            if (frame === this.page.mainFrame()) {
                this.refMap.clear();
            }
        });
    }

    url(): string {
        return this.page.url();
    }

    async title(): Promise<string> {
        return await this.page.title();
    }

    async goto(url: string): Promise<void> {
        await this.page.bringToFront().catch(() => { });
        await this.page.goto(url);
    }

    async reload(): Promise<void> {
        await this.page.reload();
    }

    async close(): Promise<void> {
        await this.detachInputSession();
        await this.page.close();
    }

    private async detachInputSession(): Promise<void> {
        const session = this.inputSession;
        this.inputSession = null;
        this.heldButtons = 0;
        if (session) {
            await session.then((s) => s.detach()).catch(() => { });
        }
    }

    private async fetchAXTree(): Promise<Protocol.Accessibility.AXNode[]> {
        const cdp = await this.page.createCDPSession();
        try {
            const { nodes } = await cdp.send('Accessibility.getFullAXTree');
            return nodes;
        } finally {
            await cdp.detach().catch(() => { });
        }
    }

    async snapshot(): Promise<string> {
        const nodes = await this.fetchAXTree();
        const { text, refMap } = compactAXTreeForLLM(nodes);
        this.refMap = refMap;
        return text;
    }

    async fullSnapshot(): Promise<string> {
        const nodes = await this.fetchAXTree();
        const { text, refMap } = optimizeAXTreeForLLM(nodes);
        this.refMap = refMap;
        return text;
    }

    async click(ref: string): Promise<{ clicked: true; ref: string; x?: number; y?: number }> {
        const backendNodeId = this.refMap.get(ref);
        if (!backendNodeId) {
            throw new Error(`Ref [${ref}] not found. Take a new snapshot.`);
        }

        const cdp = await this.page.createCDPSession();
        try {
            await this.page.bringToFront().catch(() => { });
            await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId });
            const { quads } = await cdp.send('DOM.getContentQuads', { backendNodeId });
            const q = quads[0];
            if (!q) {
                throw new Error(`Element [${ref}] is hidden or has no layout box.`);
            }
            const x = (q[0] + q[2] + q[4] + q[6]) / 4;
            const y = (q[1] + q[3] + q[5] + q[7]) / 4;

            await this.page.mouse.click(x, y);
            return { clicked: true, ref, x, y };
        } finally {
            await cdp.detach().catch(() => { });
        }
    }

    async fill(ref: string, value: string): Promise<{ filled: true; ref: string; value: string }> {
        await this.click(ref);
        await this.page.bringToFront().catch(() => { });

        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');

        if (value.length > 0) {
            const delay = randomInt(100, 500);
            await this.page.keyboard.type(value, { delay });
        }

        return { filled: true, ref, value };
    }

    async getScroll(): Promise<{ x: number; y: number; maxX: number; maxY: number }> {
        return await this.page.evaluate(() => ({
            x: window.scrollX,
            y: window.scrollY,
            maxX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            maxY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        }));
    }

    async scrollBy(left: number, top: number): Promise<{ x: number; y: number }> {
        return await this.page.evaluate((x, y) => {
            window.scrollBy(x, y);
            return { x: window.scrollX, y: window.scrollY };
        }, left, top);
    }

    async startScreencast(): Promise<FrameStream> {
        await this.page.bringToFront().catch(() => { });
        const cdp = await this.page.createCDPSession();

        let lastFrame: Buffer | null = null;
        let lastFrameAt = 0;
        let capturing = false;
        let stopped = false;
        const listeners = new Set<FrameListener>();

        const emitFrame = (buf: Buffer) => {
            lastFrame = buf;
            lastFrameAt = Date.now();
            for (const cb of listeners) {
                cb(buf);
            }
        };

        const captureFallback = async () => {
            if (stopped || capturing || this.page.isClosed()) return;
            capturing = true;
            try {
                await this.page.bringToFront().catch(() => { });
                const { data } = await cdp.send('Page.captureScreenshot', {
                    format: 'jpeg',
                    quality: 70,
                });
                if (data) {
                    emitFrame(Buffer.from(data, 'base64'));
                }
            } catch {
                // Ignore errors while page is navigating or closing
            } finally {
                capturing = false;
            }
        };

        cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
            emitFrame(Buffer.from(data, 'base64'));

            void cdp.send('Page.screencastFrameAck', {
                sessionId,
            }).catch(() => { });
        });

        await cdp.send('Page.startScreencast', {
            format: 'jpeg',
            quality: 70,
            everyNthFrame: 1,
        }).catch(() => { });

        if (!lastFrame) {
            await captureFallback();
        }

        const fallbackInterval = setInterval(() => {
            if (Date.now() - lastFrameAt > 500) {
                void captureFallback();
            }
        }, 500);

        return {
            getFrame: () => lastFrame,
            onFrame: (cb) => {
                if (stopped) return () => { };
                listeners.add(cb);
                return () => {
                    listeners.delete(cb);
                };
            },
            stop: async () => {
                stopped = true;
                listeners.clear();
                clearInterval(fallbackInterval);
                await cdp.detach().catch(() => { });
            },
        };
    }

    private async getInputSession(): Promise<CDPSession> {
        this.inputSession ??= this.page.createCDPSession().catch((err) => {
            this.inputSession = null;
            throw err;
        });
        return await this.inputSession;
    }

    async dispatchInput(msg: InputEvent): Promise<void> {
        if (this.page.isClosed()) return;
        const cdp = await this.getInputSession();

        switch (msg.t) {
            case 'mouse': {
                const button = MOUSE_BUTTONS[msg.button] ?? 'left';
                const bit = MOUSE_BUTTON_BITS[button];
                this.lastMouse = { x: msg.x, y: msg.y };

                if (msg.kind === 'move') {
                    // While a button is held CDP needs `button` + `buttons`, otherwise drag/selection breaks
                    const held = MOUSE_BUTTONS.find((b) => this.heldButtons & MOUSE_BUTTON_BITS[b]);
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mouseMoved',
                        x: msg.x,
                        y: msg.y,
                        modifiers: msg.mods,
                        button: held ?? 'none',
                        buttons: this.heldButtons,
                    });
                    break;
                }

                if (msg.kind === 'down') this.heldButtons |= bit;
                else this.heldButtons &= ~bit;

                await cdp.send('Input.dispatchMouseEvent', {
                    type: msg.kind === 'down' ? 'mousePressed' : 'mouseReleased',
                    x: msg.x,
                    y: msg.y,
                    modifiers: msg.mods,
                    button,
                    buttons: this.heldButtons,
                    clickCount: msg.clicks ?? 1,
                });
                break;
            }
            case 'wheel':
                await cdp.send('Input.dispatchMouseEvent', {
                    type: 'mouseWheel',
                    x: msg.x,
                    y: msg.y,
                    deltaX: msg.dx,
                    deltaY: msg.dy,
                    buttons: this.heldButtons,
                });
                break;
            case 'key': {
                if (IGNORED_KEYS.has(msg.key)) break;

                const keyCode = windowsKeyCode(msg.code);
                // Printable keys need `text` on keyDown, otherwise no character is inserted.
                // With Ctrl/Meta held it's a shortcut (Ctrl+A, Ctrl+C...), not text.
                const isShortcut = (msg.mods & (MOD_CTRL | MOD_META)) !== 0;
                let text: string | undefined;
                if (msg.kind === 'down' && !isShortcut) {
                    if (msg.key.length === 1) text = msg.key;
                    else if (msg.key === 'Enter') text = '\r';
                }

                await cdp.send('Input.dispatchKeyEvent', {
                    type: msg.kind === 'up' ? 'keyUp' : text ? 'keyDown' : 'rawKeyDown',
                    key: msg.key,
                    code: msg.code,
                    modifiers: msg.mods,
                    windowsVirtualKeyCode: keyCode,
                    nativeVirtualKeyCode: keyCode,
                    text,
                    unmodifiedText: text,
                    location: keyLocation(msg.key, msg.code),
                });
                break;
            }
            case 'text':
                if (msg.text) {
                    await cdp.send('Input.insertText', { text: msg.text });
                }
                break;
        }
    }

    async releaseInput(): Promise<void> {
        if (!this.heldButtons || !this.inputSession || this.page.isClosed()) {
            this.heldButtons = 0;
            return;
        }
        const cdp = await this.getInputSession();
        for (const button of MOUSE_BUTTONS) {
            const bit = MOUSE_BUTTON_BITS[button];
            if (!(this.heldButtons & bit)) continue;
            this.heldButtons &= ~bit;
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                ...this.lastMouse,
                button,
                buttons: this.heldButtons,
                clickCount: 1,
            }).catch(() => { });
        }
        // Modifiers are sent per event in CDP, so there is no held keyboard state to reset
    }

    async setViewport(width: number, height: number): Promise<{ width: number; height: number }> {
        const next = clampViewport(width, height);
        const current = this.page.viewport();

        if (current?.width !== next.width || current?.height !== next.height) {
            // Keep other viewport settings (deviceScaleFactor, isMobile...) intact
            await this.page.setViewport({ ...current, ...next });
        }

        const size = this.page.viewport();
        return size ? { width: size.width, height: size.height } : next;
    }

    async screenshot(): Promise<string> {
        const filePath = await nextScreenshotPath();
        await this.page.screenshot({ path: filePath, type: 'png' });
        return filePath;
    }

    onNavigate(cb: () => void): void {
        this.page.on('framenavigated', (frame) => {
            if (frame === this.page.mainFrame()) {
                cb();
            }
        });
    }

    onClose(cb: () => void): void {
        this.page.on('close', () => {
            this.refMap.clear();
            this.inputSession = null;
            this.heldButtons = 0;
            cb();
        });
    }
}
