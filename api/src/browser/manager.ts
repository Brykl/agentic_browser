import { randomUUID } from "node:crypto";
import type { AgentCursorListener, BrowserDriver, BrowserEngine, BrowserLaunchConfig, FrameStream, PageDriver, InputEvent } from "./types.ts";


interface BrowserSession {
    browser: BrowserDriver;
    engine: string;
    pages: Map<string, PageDriver>;
    ownerId: string;
    lastUsed: number;
    humanize: boolean;
}

export interface CreatePageParams {
    url?: string;
    viewport?: { width: number; height: number };
}

export interface BrowserSummary {
    id: string;
    engine: string;
    humanize: boolean;
    ownerId: string;
    lastUsed: number;
    pageIds: string[];
}

export interface PageInfo {
    browserId: string;
    pageId: string;
    url: string;
    title: string;
}

export class BrowserManager {
    private readonly engines = new Map<string, BrowserEngine>();
    private readonly defaultEngine: string;
    private readonly browsers = new Map<string, BrowserSession>();

    constructor(engines: BrowserEngine[], defaultEngine?: string) {
        if (engines.length === 0) {
            throw new Error('At least one BrowserEngine is required');
        }
        for (const engine of engines) {
            this.engines.set(engine.name, engine);
        }
        this.defaultEngine = defaultEngine ?? engines[0]!.name;
        if (!this.engines.has(this.defaultEngine)) {
            throw new Error(`Unknown default engine: ${this.defaultEngine}`);
        }
    }

    async createBrowser(
        ownerId: string,
        config: BrowserLaunchConfig,
        customBrowserId?: string,
    ): Promise<string> {
        const engineName = config.engine ?? this.defaultEngine;
        const engine = this.engines.get(engineName);
        if (!engine) {
            throw new Error(`Unknown browser engine: ${engineName}`);
        }

        const humanize = config.humanize ?? true;
        const browserId = customBrowserId ?? randomUUID();
        const browser = await engine.launch({ ...config, humanize });

        this.browsers.set(browserId, {
            browser,
            engine: engineName,
            pages: new Map<string, PageDriver>(),
            ownerId,
            lastUsed: Date.now(),
            humanize,
        });

        browser.onDisconnected(() => {
            this.browsers.delete(browserId);
        });

        return browserId;
    }

    listEngines(): string[] {
        return [...this.engines.keys()];
    }


    async createPage(
        browserId: string,
        params?: CreatePageParams,
        customPageId?: string,
    ): Promise<string> {
        const session = this.browsers.get(browserId);
        if (!session) throw new Error(`Browser ${browserId} not found`);

        const pageId = customPageId ?? randomUUID();
        const page = await session.browser.newPage(params?.viewport);

        session.pages.set(pageId, page);
        session.lastUsed = Date.now();

        page.onClose(() => {
            session.pages.delete(pageId);
        });

        if (params?.url) {
            try {
                await page.goto(params.url);
            } catch (err) {
                console.error(`Failed to navigate to ${params.url}:`, err);
            }
        }

        return pageId;
    }

    async closeAll(): Promise<void> {
        await Promise.all([...this.browsers.values()].map((s) => s.browser.close()));
    }

    private getPageDriver(browserId: string, pageId: string): PageDriver | undefined {
        const session = this.browsers.get(browserId);
        if (!session) return undefined;
        session.lastUsed = Date.now();
        return session.pages.get(pageId);
    }

    hasBrowser(browserId: string): boolean {
        return this.browsers.has(browserId);
    }

    listBrowsers(): BrowserSummary[] {
        return Array.from(this.browsers.entries(), ([id, session]) => ({
            id,
            engine: session.engine,
            humanize: session.humanize,
            ownerId: session.ownerId,
            lastUsed: session.lastUsed,
            pageIds: [...session.pages.keys()],
        }));
    }

    listPages(browserId: string): Array<{ pageId: string; url: string }> {
        const session = this.browsers.get(browserId);
        if (!session) return [];
        return Array.from(session.pages.entries(), ([pageId, page]) => ({
            pageId,
            url: page.url(),
        }));
    }

    async getPageInfo(browserId: string, pageId: string): Promise<PageInfo | undefined> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return {
            browserId,
            pageId,
            url: page.url(),
            title: await page.title(),
        };
    }

    async updatePageUrl(browserId: string, pageId: string, url: string): Promise<PageInfo | undefined> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        await page.goto(url);
        return {
            browserId,
            pageId,
            url: page.url(),
            title: await page.title(),
        };
    }

    async snapshotPage(browserId: string, pageId: string): Promise<string | undefined> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.snapshot();
    }

    async fullSnapshotPage(browserId: string, pageId: string): Promise<string | undefined> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.fullSnapshot();
    }

    async screenshotPage(browserId: string, pageId: string): Promise<string | undefined> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.screenshot();
    }

    async clickButton(browserId: string, pageId: string, ref: string) {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.click(ref);
    }

    async fillForm(browserId: string, pageId: string, ref: string, value: string) {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.fill(ref, value);
    }

    async availableXYscroll(browserId: string, pageId: string) {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.getScroll();
    }

    async scrollPage(browserId: string, pageId: string, left: number, top: number) {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.scrollBy(left, top);
    }

    async reloadPage(browserId: string, pageId: string): Promise<boolean> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return false;
        await page.reload();
        return true;
    }

    async deletePage(browserId: string, pageId: string): Promise<boolean> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return false;
        await page.close();
        return true;
    }

    async dispatchInput(browserId: string, pageId: string, msg: InputEvent) {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return false;
        await page.dispatchInput(msg);
        return true;
    }
    async releaseInput(browserId: string, pageId: string): Promise<void> {
        await this.getPageDriver(browserId, pageId)?.releaseInput();
    }
    async setViewport(browserId: string, pageId: string, w: number, h: number) {
        return await this.getPageDriver(browserId, pageId)?.setViewport(w, h);
    }

    async closeBrowser(browserId: string): Promise<boolean> {
        const session = this.browsers.get(browserId);
        if (!session) return false;
        this.browsers.delete(browserId);
        await session.browser.close();
        return true;
    }

    async startScreencast(browserId: string, pageId: string): Promise<FrameStream | undefined> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.startScreencast();
    }

    onAgentCursor(browserId: string, pageId: string, cb: AgentCursorListener): (() => void) | undefined {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return page.onAgentCursor(cb);
    }
}