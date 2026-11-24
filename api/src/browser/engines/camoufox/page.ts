import { randomInt } from "node:crypto";
import type { AgentCursorEvent, AgentCursorListener, FrameListener, FrameStream, PageDriver, InputEvent } from "../../types.ts";
import type { Page } from "playwright-core";
import { compactAriaSnapshot } from "./aria-snapshot.ts";
import {
    IGNORED_KEYS,
    MOD_ALT,
    MOD_CTRL,
    MOD_META,
    MODIFIER_KEYS,
    MOUSE_BUTTONS,
    clampViewport,
    modifierBit,
} from "../../input.ts";
import { nextScreenshotPath } from "../../screenshot.ts";
import { humanPath, pointInside, rand, sleep, visiblePart } from "../../human.ts";

/** Target frame budget while the page is actively changing (~25 FPS). */
const ACTIVE_FRAME_MS = 40;
/** Slower poll interval once the page has been static for several frames. */
const IDLE_FRAME_MS = 160;
const IDLE_THRESHOLD = 4;

export class CamoufoxPageDriver implements PageDriver {
    private readonly page: Page;
    private readonly humanize: boolean;
    private lastFrame: Buffer | null = null;
    private readonly frameListeners = new Set<FrameListener>();
    private readonly cursorListeners = new Set<AgentCursorListener>();
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

    constructor(page: Page, humanize = false) {
        this.page = page;
        this.humanize = humanize;
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
        this.cursorListeners.clear();
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

        if (!this.humanize) {
            await locator.scrollIntoViewIfNeeded();
            const box = await locator.boundingBox();
            const x = box ? Math.round(box.x + box.width / 2) : undefined;
            const y = box ? Math.round(box.y + box.height / 2) : undefined;
            if (x !== undefined && y !== undefined) {
                this.emitAgentCursor({ kind: 'move', x, y });
                this.emitAgentCursor({ kind: 'down', x, y });
            }
            try {
                await locator.click();
            } finally {
                if (x !== undefined && y !== undefined) {
                    this.emitAgentCursor({ kind: 'up', x, y });
                }
            }
            return { clicked: true, ref, x, y };
        }

        await locator.click({ trial: true });

        const box = await locator.boundingBox();
        if (!box) throw new Error(`Element [${ref}] is hidden or has no layout box.`);
        const vp = this.page.viewportSize() ?? { width: 1280, height: 720 };
        const target = pointInside(visiblePart(box, vp));

        const from = this.lastMouse ?? { x: rand(0, vp.width), y: rand(0, vp.height) };
        for (const p of humanPath(from, target)) {
            if (p.dt) await sleep(p.dt);
            await this.moveMouseIfNeeded(p.x, p.y);
            this.emitAgentCursor({ kind: 'move', x: p.x, y: p.y });
        }

        const clickX = Math.round(target.x);
        const clickY = Math.round(target.y);
        await sleep(rand(40, 160));
        this.emitAgentCursor({ kind: 'down', x: clickX, y: clickY });
        try {
            await this.page.mouse.down();
            await sleep(rand(50, 130));
            await this.page.mouse.up();
        } finally {
            this.emitAgentCursor({ kind: 'up', x: clickX, y: clickY });
        }

        return { clicked: true, ref, x: target.x, y: target.y };
    }

    async fill(ref: string, value: string): Promise<{ filled: boolean; ref: string; value: string }> {
        await this.click(ref);

        await this.page.keyboard.press('Control+a');
        await this.page.keyboard.press('Backspace');

        if (value.length > 0) {

            if (this.humanize) {
                const chars = [...value];
                for (let i = 0; i < chars.length; i++) {
                    await this.page.keyboard.type(chars[i]!, { delay: randomInt(10, 25) });
                    if (i < chars.length - 1) {
                        await sleep(randomInt(15, 50));
                    }
                }
                return { filled: true, ref, value };
            }
            await this.page.keyboard.insertText(value)
            return { filled: true, ref, value };
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

    private async pressKey(kind: 'down' | 'up', key: string, code: string, mods: number): Promise<void> {
        const keyboard = this.page.keyboard;
        const send = (k: string) => (kind === 'down' ? keyboard.down(k) : keyboard.up(k));
        try {
            await send(key);
        } catch {
            // Playwright's keyboard.down/up only know US layout keys.
            // For printable non-US characters (e.g. Cyrillic) without shortcut modifiers,
            // insert the character directly instead of falling back to the US physical key code.
            const isShortcut = (mods & (MOD_ALT | MOD_CTRL | MOD_META)) !== 0;
            if (!isShortcut && key.length === 1) {
                if (kind === 'down') {
                    await keyboard.insertText(key).catch(() => { });
                }
                return;
            }
            if (code && code !== key) {
                await send(code).catch(() => { });
            }
        }
    }

    async screenshot(): Promise<string> {
        const filePath = await nextScreenshotPath();
        await this.page.screenshot({ path: filePath, type: 'png' });
        return filePath;
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
                await this.pressKey(msg.kind, msg.key, msg.code, msg.mods);
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
        this.page.on('close', cb)
    }
}