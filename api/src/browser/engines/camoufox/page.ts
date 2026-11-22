import { randomInt } from "node:crypto";
import type { FrameStream, PageDriver, InputEvent } from "../../types.ts";
import type { Page } from "playwright-core";
import { compactAriaSnapshot } from "./aria-snapshot.ts";
import {
    IGNORED_KEYS,
    MODIFIER_KEYS,
    MOUSE_BUTTONS,
    clampViewport,
    modifierBit,
} from "../../input.ts";

export class CamoufoxPageDriver implements PageDriver {
    private readonly page: Page;
    private lastFrame: string | null = null;
    private screencastSubscribers = 0;
    private screencastStartPromise: Promise<void> | null = null;
    /** Frame size the running screencast was started with */
    private screencastSize: { width: number; height: number } | null = null;
    /** Modifier keys currently held down via dispatchInput (MOD_* bitmask) */
    private heldModifiers = 0;
    /** Mouse buttons currently held down via dispatchInput */
    private readonly heldButtons = new Set<(typeof MOUSE_BUTTONS)[number]>();

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
    private startCapture(): Promise<void> {
        const size = this.page.viewportSize() ?? { width: 1920, height: 1080 };
        this.screencastSize = size;

        const promise: Promise<void> = (async () => {
            await this.page.screencast.start({
                size,
                quality: 70,
                onFrame: ({ data }) => {
                    this.lastFrame = data.toString('base64');
                },
            });

            if (!this.lastFrame && !this.page.isClosed()) {
                const buf = await this.page.screenshot({ type: 'jpeg', quality: 70 }).catch(() => null);
                if (buf && !this.lastFrame) {
                    this.lastFrame = buf.toString('base64');
                }
            }
        })().catch((err) => {
            if (this.screencastStartPromise === promise) {
                this.screencastStartPromise = null;
                this.screencastSize = null;
            }
            throw err;
        });
        return promise;
    }

    async startScreencast(): Promise<FrameStream> {
        await this.page.bringToFront().catch(() => { });

        this.screencastSubscribers++;

        if (!this.screencastStartPromise) {
            this.screencastStartPromise = this.startCapture();
        }

        try {
            await this.screencastStartPromise;
        } catch (err) {
            this.screencastSubscribers = Math.max(0, this.screencastSubscribers - 1);
            throw err;
        }

        let stopped = false;
        return {
            getFrame: () => this.lastFrame,
            stop: async () => {
                if (stopped) return;
                stopped = true;
                this.screencastSubscribers = Math.max(0, this.screencastSubscribers - 1);
                if (this.screencastSubscribers === 0) {
                    this.screencastStartPromise = null;
                    this.screencastSize = null;
                    await this.page.screencast.stop().catch(() => { });
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

    async dispatchInput(msg: InputEvent): Promise<void> {
        if (this.page.isClosed()) return;

        switch (msg.t) {
            case 'mouse': {
                const button = MOUSE_BUTTONS[msg.button] ?? 'left';
                const clickCount = msg.clicks ?? 1;

                await this.syncModifiers(msg.mods);
                await this.page.mouse.move(msg.x, msg.y);
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
                await this.page.mouse.move(msg.x, msg.y);
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
            await this.restartScreencastIfSizeChanged();
        }

        const size = this.page.viewportSize();
        return size ? { width: size.width, height: size.height } : next;
    }

    /** Playwright screencast has a fixed frame size, so restart it after a viewport change. */
    private async restartScreencastIfSizeChanged(): Promise<void> {
        const running = this.screencastStartPromise;
        if (!running || this.screencastSubscribers === 0) return;

        await running.catch(() => { });
        const size = this.page.viewportSize();
        if (
            !size ||
            this.screencastStartPromise !== running || // stopped or restarted meanwhile
            (size.width === this.screencastSize?.width && size.height === this.screencastSize?.height)
        ) {
            return;
        }

        await this.page.screencast.stop().catch(() => { });
        this.screencastStartPromise = this.startCapture();
        await this.screencastStartPromise.catch(() => { });
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