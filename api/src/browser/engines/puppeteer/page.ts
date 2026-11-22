import { randomInt } from 'node:crypto';
import type { Page } from 'puppeteer';
import type { Protocol } from 'puppeteer-core';
import type { FrameStream, PageDriver, InputEvent } from '../../types.ts';
import { compactAXTreeForLLM, optimizeAXTreeForLLM } from './ax-tree.ts';

export class PuppeteerPageDriver implements PageDriver {
    private readonly page: Page;
    private refMap = new Map<string, number>();

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
        await this.page.close();
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

        let lastFrame: string | null = null;
        let lastFrameAt = 0;
        let capturing = false;
        let stopped = false;

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
                    lastFrame = data;
                    lastFrameAt = Date.now();
                }
            } catch {
                // Ignore errors while page is navigating or closing
            } finally {
                capturing = false;
            }
        };

        cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
            lastFrame = data;
            lastFrameAt = Date.now();

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
            stop: async () => {
                stopped = true;
                clearInterval(fallbackInterval);
                await cdp.detach().catch(() => { });
            },
        };
    }

    async dispatchInput(msg: InputEvent): Promise<void> {
        // TODO: const cdp = this.page.createCDPSession()
    }

    async setViewport(width: number, height: number): Promise<{ width: number; height: number }> {
        await this.page.setViewport({ width, height });
        const size = this.page.viewport();
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
        this.page.on('close', () => {
            this.refMap.clear();
            cb();
        });
    }
}
