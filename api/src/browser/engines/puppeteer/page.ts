import { randomInt } from 'node:crypto';
import type { CDPSession, Frame, HTTPRequest, Page } from 'puppeteer';
import type { Protocol } from 'puppeteer-core';
import type {
    AgentCursorEvent,
    AgentCursorListener,
    ClickOptions,
    ClickResult,
    FrameListener,
    FrameStream,
    InputEvent,
    PageDriver,
    WaitOptions,
    WaitResult,
} from '../../types.ts';
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
import {
    DEFAULT_CLICK_NAV_DETECT_MS,
    DEFAULT_CLICK_NAV_TIMEOUT_MS,
    WaitTimeoutError,
    clampWaitTimeout,
    isTimeoutError,
    matchUrlPattern,
    remainingMs,
    waitSleep,
} from '../../wait.ts';

export class PuppeteerPageDriver implements PageDriver {
    private readonly page: Page;
    private readonly humanize: boolean;
    private refMap = new Map<string, number>();
    private readonly cursorListeners = new Set<AgentCursorListener>();
    /** Long-lived CDP session for UI input, created on first dispatchInput */
    private inputSession: Promise<CDPSession> | null = null;
    /** Mouse buttons currently held by the UI user (CDP `buttons` bitmask) */
    private heldButtons = 0;
    /** Last mouse position sent by the UI, used to release held buttons */
    private lastMouse = { x: 0, y: 0 };

    constructor(page: Page, humanize = false) {
        this.page = page;
        this.humanize = humanize;
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
        this.cursorListeners.clear();
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

    async click(ref: string, options?: ClickOptions): Promise<ClickResult> {
        const backendNodeId = this.refMap.get(ref);
        if (!backendNodeId) {
            throw new Error(`Ref [${ref}] not found. Take a new snapshot.`);
        }

        const waitForNav = options?.waitForNavigation ?? true;
        const detectMs = options?.navigationDetectMs ?? DEFAULT_CLICK_NAV_DETECT_MS;
        const navTimeoutMs = options?.navigationTimeoutMs ?? DEFAULT_CLICK_NAV_TIMEOUT_MS;

        const cdp = await this.page.createCDPSession();
        let frameNavigated = false;
        let navRequest: HTTPRequest | null = null;
        let resolveNavStarted: (() => void) | undefined;
        let resolveNavFailed: (() => void) | undefined;
        const navStarted = new Promise<void>((resolve) => {
            resolveNavStarted = resolve;
        });
        const navFailed = new Promise<false>((resolve) => {
            resolveNavFailed = () => resolve(false);
        });
        const onFrameNavigated = (frame: Frame) => {
            if (frame === this.page.mainFrame()) {
                frameNavigated = true;
                resolveNavStarted?.();
            }
        };
        const onRequest = (req: HTTPRequest) => {
            if (req.isNavigationRequest() && req.frame() === this.page.mainFrame()) {
                navRequest = req;
                resolveNavStarted?.();
            }
        };
        const onRequestFailed = (req: HTTPRequest) => {
            if (req === navRequest) {
                resolveNavFailed?.();
            }
        };
        const onClose = () => {
            resolveNavStarted?.();
            resolveNavFailed?.();
        };

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
            const cx = Math.round(x);
            const cy = Math.round(y);

            const urlBefore = this.page.url();
            let navPromise: Promise<boolean> | null = null;
            if (waitForNav) {
                this.page.on('framenavigated', onFrameNavigated);
                this.page.on('request', onRequest);
                this.page.on('requestfailed', onRequestFailed);
                this.page.on('close', onClose);
                navPromise = this.page
                    .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: navTimeoutMs })
                    .then(() => true)
                    .catch(() => false);
            }

            this.emitAgentCursor({ kind: 'move', x: cx, y: cy });
            this.emitAgentCursor({ kind: 'down', x: cx, y: cy });
            try {
                await this.page.mouse.click(x, y);
            } finally {
                this.emitAgentCursor({ kind: 'up', x: cx, y: cy });
            }

            if (!waitForNav || this.page.isClosed()) {
                return { clicked: true, ref, x, y, navigated: false };
            }

            if (!navRequest && !frameNavigated && this.page.url() === urlBefore && detectMs > 0) {
                await Promise.race([navStarted, waitSleep(detectMs)]);
            }

            const navDetected = Boolean(navRequest) || frameNavigated || (!this.page.isClosed() && this.page.url() !== urlBefore);
            let waitedNav = false;
            if (navDetected && navPromise && !this.page.isClosed()) {
                waitedNav = await Promise.race([navPromise, navFailed]);
            }

            const navigated = frameNavigated || waitedNav || (!this.page.isClosed() && this.page.url() !== urlBefore);
            return { clicked: true, ref, x, y, navigated };
        } finally {
            if (waitForNav) {
                this.page.off('framenavigated', onFrameNavigated);
                this.page.off('request', onRequest);
                this.page.off('requestfailed', onRequestFailed);
                this.page.off('close', onClose);
            }
            await cdp.detach().catch(() => { });
        }
    }

    /**
     * Insert text into a focused `contenteditable` element (e.g. Lexical in WhatsApp Web,
     * Draft.js, Slate) via a synthetic `paste` event, avoiding CDP `Input.insertText`
     * text duplication on rich-text editors.
     * Returns `true` if handled, or `false` if the active element is a normal input.
     */
    private async fillContentEditable(value: string): Promise<boolean> {
        return await this.page.evaluate((text: string) => {
            const el = document.activeElement;
            if (!(el instanceof HTMLElement) || !el.isContentEditable) {
                return false;
            }
            const before = el.textContent ?? '';
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true,
                composed: true,
            });
            const notCancelled = el.dispatchEvent(pasteEvent);
            if (!notCancelled || (el.textContent ?? '') !== before) {
                return true;
            }
            return document.execCommand('insertText', false, text);
        }, value);
    }

    async fill(ref: string, value: string): Promise<{ filled: true; ref: string; value: string }> {
        await this.click(ref, { waitForNavigation: false });
        await this.page.bringToFront().catch(() => { });

        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');

        if (value.length > 0) {
            if (await this.fillContentEditable(value)) {
                return { filled: true, ref, value };
            }

            if (this.humanize) {
                await this.page.keyboard.type(value, { delay: randomInt(15, 50) });
            } else {
                await this.page.keyboard.sendCharacter(value);
            }
        }

        return { filled: true, ref, value };
    }

    private async waitForUrlPattern(pattern: string, deadline: number, totalTimeoutMs: number): Promise<void> {
        if (matchUrlPattern(this.page.url(), pattern)) return;

        await new Promise<void>((resolve, reject) => {
            const left = deadline - Date.now();
            if (left <= 0) {
                reject(new WaitTimeoutError(`Wait timed out after ${totalTimeoutMs}ms waiting for url matching "${pattern}"`));
                return;
            }

            const check = () => {
                if (this.page.isClosed()) {
                    cleanup();
                    reject(new Error('Page closed while waiting for URL'));
                    return;
                }
                if (matchUrlPattern(this.page.url(), pattern)) {
                    cleanup();
                    resolve();
                }
            };

            const onNav = (frame: Frame) => {
                if (frame === this.page.mainFrame()) check();
            };

            const pollTimer = setInterval(check, 100);
            const timeoutTimer = setTimeout(() => {
                cleanup();
                reject(new WaitTimeoutError(`Wait timed out after ${totalTimeoutMs}ms waiting for url matching "${pattern}"`));
            }, left);

            const cleanup = () => {
                clearInterval(pollTimer);
                clearTimeout(timeoutTimer);
                this.page.off('framenavigated', onNav);
            };

            this.page.on('framenavigated', onNav);
            check();
        });
    }

    async wait(options: WaitOptions): Promise<WaitResult> {
        const startedAt = Date.now();
        const timeout = clampWaitTimeout(options.timeout);
        const deadline = startedAt + timeout;

        try {
            if (options.url) {
                await this.waitForUrlPattern(options.url, deadline, timeout);
            }

            if (options.load) {
                const left = remainingMs(deadline, `load state "${options.load}"`, timeout);
                if (options.load === 'networkidle') {
                    await this.page.waitForNetworkIdle({ timeout: left });
                } else if (options.load === 'load') {
                    await this.page.waitForFunction(() => document.readyState === 'complete', { timeout: left });
                } else {
                    await this.page.waitForFunction(
                        () => document.readyState === 'interactive' || document.readyState === 'complete',
                        { timeout: left },
                    );
                }
            }

            if (options.text) {
                const left = remainingMs(deadline, `text "${options.text}"`, timeout);
                await this.page.waitForFunction(
                    (needle: string) => Boolean(document.body?.innerText?.includes(needle)),
                    { timeout: left },
                    options.text,
                );
            }
        } catch (err) {
            if (err instanceof WaitTimeoutError) throw err;
            if (isTimeoutError(err)) {
                throw new WaitTimeoutError(`Wait timed out after ${timeout}ms: ${err instanceof Error ? err.message : String(err)}`);
            }
            throw err;
        }

        return { waited: true, elapsedMs: Date.now() - startedAt };
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

    private emitAgentCursor(event: AgentCursorEvent): void {
        for (const cb of this.cursorListeners) {
            cb(event);
        }
    }

    onAgentCursor(cb: AgentCursorListener): () => void {
        this.cursorListeners.add(cb);
        return () => {
            this.cursorListeners.delete(cb);
        };
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
            this.cursorListeners.clear();
            this.inputSession = null;
            this.heldButtons = 0;
            cb();
        });
    }
}
