import { randomInt } from "node:crypto";
import type { FrameListener, FrameStream, PageDriver, InputEvent } from "../../types.ts";
import type { Page } from "playwright-core";
import { compactAriaSnapshot } from "./aria-snapshot.ts";
import {
    IGNORED_KEYS,
    MODIFIER_KEYS,
    MOUSE_BUTTONS,
    clampViewport,
    modifierBit,
} from "../../input.ts";

/** Target frame budget while the page is actively changing (~25 FPS). */
const ACTIVE_FRAME_MS = 40;
/** Slower poll interval once the page has been static for several frames. */
const IDLE_FRAME_MS = 160;
const IDLE_THRESHOLD = 4;

export class CamoufoxPageDriver implements PageDriver {
    private readonly page: Page;
    private lastFrame: Buffer | null = null;
    private readonly frameListeners = new Set<FrameListener>();
    private screencastSubscribers = 0;
    private screencastTimer: ReturnType<typeof setTimeout> | null = null;
    private screencastCapturing = false;
    private captureRequested = false;
    private unchangedFrames = 0;
    /** Modifier keys currently held down via dispatchInput (MOD_* bitmask) */
    private heldModifiers = 0;
    /** Mouse buttons currently held down via dispatchInput */
    private readonly heldButtons = new Set<(typeof MOUSE_BUTTONS)[number]>();
    /** Last mouse coordinates dispatched via Playwright, used to skip redundant moves */
    private lastMouse: { x: number; y: number } | null = null;

    constructor(page: Page) {
        this.page = page;
    }

    url(): string {
        return this.page.url()
    }
    async title(): Promise<string> {
        return this.page.title()
    }
    async goto(url: string): Promise<void> {
        await this.page.goto(url)
        return
    }
    async reload(): Promise<void> {
        await this.page.reload()
        return
    }
    async close(): Promise<void> {
        this.stopCaptureLoop();
        await this.page.close()
        return
    }
    async snapshot(): Promise<string> {
        const raw = await this.page.ariaSnapshot({ mode: 'ai' });
        return compactAriaSnapshot(raw);
    }
    async fullSnapshot(): Promise<string> {
        return await this.page.ariaSnapshot({ mode: 'ai' });
    }
    async click(ref: string): Promise<{ clicked: true; ref: string; x?: number; y?: number }> {
        await this.page.bringToFront().catch(() => { });
        const locator = this.page.locator(`aria-ref=${ref}`);
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        await locator.click();

        return {
            clicked: true,
            ref,
            x: box ? box.x + box.width / 2 : undefined,
            y: box ? box.y + box.height / 2 : undefined,
        };
    }
    async fill(ref: string, value: string): Promise<{ filled: true; ref: string; value: string }> {
        await this.click(ref);

        await this.page.keyboard.press('Control+a');
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
        return await this.page.evaluate(
            ({ x, y }) => {
                window.scrollBy(x, y);
                return { x: window.scrollX, y: window.scrollY };
            },
            { x: left, y: top },
        );
    }
    /**
     * Camoufox's native `page.screencast` captures from document `(0, 0)` without
     * applying scroll offsets (leaving normal content frozen while `position: fixed`
     * headers drift down by `scrollY`). Poll `page.screenshot()` instead, which
     * passes the scrolled viewport clip and renders accurately.
     */
    private async captureFrame(): Promise<void> {
        if (this.page.isClosed()) return;
        if (this.screencastCapturing) {
            this.captureRequested = true;
            return;
        }
        this.screencastCapturing = true;
        const startedAt = Date.now();
        try {
            const buf = await this.page.screenshot({
                type: 'jpeg',
                quality: 70,
                animations: 'allow',
            });
            const changed = !this.lastFrame || !buf.equals(this.lastFrame);
            if (changed) {
                this.lastFrame = buf;
                this.unchangedFrames = 0;
                for (const cb of this.frameListeners) {
                    cb(buf);
                }
            } else {
                this.unchangedFrames++;
            }
        } catch {
            // Ignore transient errors while page is navigating or closing
        } finally {
            this.screencastCapturing = false;
            const elapsed = Date.now() - startedAt;
            if (this.captureRequested && this.screencastSubscribers > 0 && !this.page.isClosed()) {
                this.captureRequested = false;
                this.scheduleNextFrame(ACTIVE_FRAME_MS);
            } else {
                this.scheduleNextFrame(elapsed);
            }
        }
    }

    private scheduleNextFrame(elapsedMs = 0): void {
        if (this.screencastSubscribers === 0 || this.page.isClosed() || this.screencastTimer) {
            return;
        }
        const targetMs = this.unchangedFrames >= IDLE_THRESHOLD ? IDLE_FRAME_MS : ACTIVE_FRAME_MS;
        const delay = Math.max(0, targetMs - elapsedMs);
        this.screencastTimer = setTimeout(() => {
            this.screencastTimer = null;
            void this.captureFrame();
        }, delay);
    }

    private triggerImmediateCapture(): void {
        if (this.screencastSubscribers === 0 || this.page.isClosed()) return;
        this.unchangedFrames = 0;
        if (this.screencastCapturing) {
            this.captureRequested = true;
            return;
        }
        this.stopCaptureLoop();
        void this.captureFrame();
    }

    private stopCaptureLoop(): void {
        if (this.screencastTimer) {
            clearTimeout(this.screencastTimer);
            this.screencastTimer = null;
        }
        this.captureRequested = false;
    }

    async startScreencast(): Promise<FrameStream> {
        await this.page.bringToFront().catch(() => { });

        const wasIdle = this.screencastSubscribers === 0;
        this.screencastSubscribers++;
        this.unchangedFrames = 0;

        if (wasIdle || !this.lastFrame) {
            await this.captureFrame();
        }

        let stopped = false;
        const streamListeners = new Set<FrameListener>();
        return {
            getFrame: () => this.lastFrame,
            onFrame: (cb) => {
                if (stopped) return () => { };
                streamListeners.add(cb);
                this.frameListeners.add(cb);
                return () => {
                    streamListeners.delete(cb);
                    this.frameListeners.delete(cb);
                };
            },
            stop: async () => {
                if (stopped) return;
                stopped = true;
                for (const cb of streamListeners) {
                    this.frameListeners.delete(cb);
                }
                streamListeners.clear();
                this.screencastSubscribers = Math.max(0, this.screencastSubscribers - 1);
                if (this.screencastSubscribers === 0) {
                    this.stopCaptureLoop();
                }
            },
        };
    }
    /**
     * Press/release Alt/Control/Meta/Shift so Playwright's keyboard state matches `mods`.
     * Playwright applies held keyboard modifiers to mouse events (Shift+click, Ctrl+click...).
     */
    private async syncModifiers(mods: number): Promise<void> {
        for (const [bit, name] of MODIFIER_KEYS) {
            const wanted = (mods & bit) !== 0;
            const held = (this.heldModifiers & bit) !== 0;
            if (wanted && !held) {
                await this.page.keyboard.down(name);
                this.heldModifiers |= bit;
            } else if (!wanted && held) {
                await this.page.keyboard.up(name);
                this.heldModifiers &= ~bit;
            }
        }
    }

    private async pressKey(kind: 'down' | 'up', key: string, code: string): Promise<void> {
        const keyboard = this.page.keyboard;
        const send = (k: string) => (kind === 'down' ? keyboard.down(k) : keyboard.up(k));
        try {
            await send(key);
        } catch {
            // Key name unknown to Playwright: fall back to the physical key code (KeyA, Digit1...)
            if (code && code !== key) {
                await send(code).catch(() => { });
            }
        }
    }

    private async moveMouseIfNeeded(x: number, y: number): Promise<void> {
        if (this.lastMouse?.x === x && this.lastMouse.y === y) return;
        await this.page.mouse.move(x, y);
        this.lastMouse = { x, y };
    }

    async dispatchInput(msg: InputEvent): Promise<void> {
        if (this.page.isClosed()) return;

        switch (msg.t) {
            case 'mouse': {
                const button = MOUSE_BUTTONS[msg.button] ?? 'left';
                const clickCount = msg.clicks ?? 1;

                await this.syncModifiers(msg.mods);
                await this.moveMouseIfNeeded(msg.x, msg.y);
                if (msg.kind === 'down') {
                    this.heldButtons.add(button);
                    await this.page.mouse.down({ button, clickCount });
                } else if (msg.kind === 'up') {
                    this.heldButtons.delete(button);
                    await this.page.mouse.up({ button, clickCount });
                }
                break;
            }
            case 'wheel':
                await this.moveMouseIfNeeded(msg.x, msg.y);
                await this.page.mouse.wheel(msg.dx, msg.dy);
                break;
            case 'key': {
                if (IGNORED_KEYS.has(msg.key)) break;

                const bit = modifierBit(msg.key);
                if (bit) {
                    // The modifier key itself: track its state instead of syncing from `mods`
                    const held = (this.heldModifiers & bit) !== 0;
                    if (msg.kind === 'down' && !held) {
                        await this.page.keyboard.down(msg.key);
                        this.heldModifiers |= bit;
                    } else if (msg.kind === 'up' && held) {
                        await this.page.keyboard.up(msg.key);
                        this.heldModifiers &= ~bit;
                    }
                    break;
                }

                await this.syncModifiers(msg.mods);
                await this.pressKey(msg.kind, msg.key, msg.code);
                break;
            }
            case 'text':
                if (msg.text) {
                    await this.page.keyboard.insertText(msg.text);
                }
                break;
        }

        this.triggerImmediateCapture();
    }

    async releaseInput(): Promise<void> {
        if (this.page.isClosed()) {
            this.heldButtons.clear();
            this.heldModifiers = 0;
            return;
        }
        for (const button of [...this.heldButtons]) {
            this.heldButtons.delete(button);
            await this.page.mouse.up({ button }).catch(() => { });
        }
        await this.syncModifiers(0).catch(() => { this.heldModifiers = 0; });
    }

    async setViewport(width: number, height: number): Promise<{ width: number; height: number }> {
        const next = clampViewport(width, height);
        const current = this.page.viewportSize();

        if (current?.width !== next.width || current?.height !== next.height) {
            await this.page.setViewportSize(next);
            this.triggerImmediateCapture();
        }

        const size = this.page.viewportSize();
        return size ? { width: size.width, height: size.height } : next;
    }

    onNavigate(cb: () => void): void {
        this.page.on('framenavigated', (frame) => {
            if (frame === this.page.mainFrame()) {
                cb();
            }
        });
    }
    onClose(cb: () => void): void {
        this.page.on('close', cb)
    }
}