import { randomInt } from "node:crypto";
import type { FrameStream, PageDriver, InputEvent } from "../../types.ts";
import type { Page } from "playwright-core";
import { compactAriaSnapshot } from "./aria-snapshot.ts";

export class CamoufoxPageDriver implements PageDriver {
    private readonly page: Page;
    private lastFrame: string | null = null;
    private screencastSubscribers = 0;
    private screencastStartPromise: Promise<void> | null = null;

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
    async startScreencast(): Promise<FrameStream> {
        await this.page.bringToFront().catch(() => { });

        const size = this.page.viewportSize() ?? { width: 1920, height: 1080 };

        this.screencastSubscribers++;

        if (!this.screencastStartPromise) {
            this.screencastStartPromise = (async () => {
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
                this.screencastStartPromise = null;
                throw err;
            });
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
                    await this.page.screencast.stop().catch(() => { });
                }
            },
        };
    }
    async dispatchInput(msg: InputEvent): Promise<void> {
        switch (msg.t) {
            case 'mouse':
                const button = MOUSE_BUTTONS[msg.button] ?? 'left';
                const clickCount = msg.clicks ?? 1;

                switch (msg.kind) {
                    case 'move':
                        await this.page.mouse.move(msg.x, msg.y);
                        break;
                    case 'down':
                        await this.page.mouse.move(msg.x, msg.y);
                        await this.page.mouse.down({ button, clickCount });
                        break;
                    case 'up':
                        await this.page.mouse.move(msg.x, msg.y);
                        await this.page.mouse.up({ button, clickCount });
                        break;
                }
                break;
            case 'wheel':
                await this.page.mouse.move(msg.x, msg.y);
                await this.page.mouse.wheel(msg.dx, msg.dy);
                break;
            case 'key':
                if (msg.kind === 'down') {
                    await this.page.keyboard.down(msg.key || msg.code);
                } else {
                    await this.page.keyboard.up(msg.key || msg.code);
                }
                break;
            case 'text':
                if (msg.text) {
                    await this.page.keyboard.insertText(msg.text);
                }
                break;
        }
    }

    async setViewport(width: number, height: number): Promise<{ width: number; height: number }> {
        await this.page.setViewportSize({ width, height });
        const size = this.page.viewportSize();
        return size ? { width: size.width, height: size.height } : { width, height };
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


const MOUSE_BUTTONS = ['left', 'middle', 'right'] as const;