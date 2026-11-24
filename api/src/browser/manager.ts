import { randomUUID } from "node:crypto";
import {
    type ActionOptions,
    type AgentCursorListener,
    type BrowserDriver,
    type BrowserEngine,
    type BrowserLaunchConfig,
    type ClickOptions,
    type FillFieldInput,
    type FillFieldResult,
    type FrameStream,
    type InputEvent,
    type PageActionMeta,
    type PageDriver,
    type WaitOptions,
    type WaitResult,
    FillBatchError,
} from "./types.ts";
import { computeSnapshotDiff } from "./snapshot-diff.ts";

const SETTLE_DELAY_MS = 120;
const TITLE_RETRY_ATTEMPTS = 3;
const TITLE_RETRY_DELAY_MS = 120;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BrowserSession {
    browser: BrowserDriver;
    engine: string;
    pages: Map<string, PageDriver>;
    lastSnapshots: Map<string, string>;
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

        const humanize = config.humanize ?? false;
        const browserId = customBrowserId ?? randomUUID();
        const browser = await engine.launch({ ...config, humanize });

        this.browsers.set(browserId, {
            browser,
            engine: engineName,
            pages: new Map<string, PageDriver>(),
            lastSnapshots: new Map<string, string>(),
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
            session.lastSnapshots.delete(pageId);
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

    private async safeTitle(page: PageDriver): Promise<string> {
        for (let attempt = 0; attempt < TITLE_RETRY_ATTEMPTS; attempt++) {
            try {
                return await page.title();
            } catch {
                if (attempt < TITLE_RETRY_ATTEMPTS - 1) {
                    await delay(TITLE_RETRY_DELAY_MS);
                }
            }
        }
        return '';
    }

    private async collectActionMeta(
        session: BrowserSession,
        pageId: string,
        page: PageDriver,
        prevUrl: string,
        opts?: ActionOptions,
        settle = false,
        driverNavigated = false,
    ): Promise<PageActionMeta> {
        if (settle && opts?.snapshot) {
            await delay(SETTLE_DELAY_MS);
        }

        const url = page.url();
        const title = await this.safeTitle(page);
        const navigated = driverNavigated || prevUrl !== url;

        if (!opts?.snapshot) {
            return { url, title, navigated };
        }

        if (opts.snapshot === 'full') {
            const snapshot = await page.fullSnapshot();
            return { url, title, navigated, snapshot, snapshotMode: 'full' };
        }

        if (opts.snapshot === 'compact') {
            const snapshot = await page.snapshot();
            session.lastSnapshots.set(pageId, snapshot);
            return { url, title, navigated, snapshot, snapshotMode: 'compact' };
        }

        // snapshot === 'diff'
        const current = await page.snapshot();
        const previous = session.lastSnapshots.get(pageId);
        session.lastSnapshots.set(pageId, current);

        if (navigated || previous === undefined) {
            return { url, title, navigated, snapshot: current, snapshotMode: 'compact' };
        }

        const diff = computeSnapshotDiff(previous, current);
        return { url, title, navigated, snapshot: diff.text, snapshotMode: diff.mode };
    }

    async getPageActionMeta(
        browserId: string,
        pageId: string,
        opts?: ActionOptions,
    ): Promise<PageActionMeta | undefined> {
        const session = this.browsers.get(browserId);
        if (!session) return undefined;
        session.lastUsed = Date.now();
        const page = session.pages.get(pageId);
        if (!page) return undefined;
        return await this.collectActionMeta(session, pageId, page, page.url(), opts, false);
    }

    async getPageInfo(browserId: string, pageId: string): Promise<PageInfo | undefined> {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return {
            browserId,
            pageId,
            url: page.url(),
            title: await this.safeTitle(page),
        };
    }

    async updatePageUrl(
        browserId: string,
        pageId: string,
        url: string,
        opts?: ActionOptions,
    ): Promise<(PageInfo & PageActionMeta) | undefined> {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const prevUrl = page.url();
        await page.goto(url);
        const meta = await this.collectActionMeta(session, pageId, page, prevUrl, opts, false);
        return {
            browserId,
            pageId,
            ...meta,
        };
    }

    async snapshotPage(browserId: string, pageId: string): Promise<string | undefined> {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const snapshot = await page.snapshot();
        session.lastSnapshots.set(pageId, snapshot);
        return snapshot;
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

    async clickButton(browserId: string, pageId: string, ref: string, opts?: ActionOptions & ClickOptions) {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const prevUrl = page.url();
        const result = await page.click(ref, opts);
        const meta = await this.collectActionMeta(
            session,
            pageId,
            page,
            prevUrl,
            opts,
            false,
            Boolean(result.navigated),
        );
        return { ...result, ...meta };
    }

    async waitPage(
        browserId: string,
        pageId: string,
        waitOpts: WaitOptions,
        actionOpts?: ActionOptions,
    ): Promise<(WaitResult & PageActionMeta) | undefined> {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const prevUrl = page.url();
        const result = await page.wait(waitOpts);
        const meta = await this.collectActionMeta(session, pageId, page, prevUrl, actionOpts, false);
        return { ...result, ...meta };
    }

    async fillForm(browserId: string, pageId: string, ref: string, value: string, opts?: ActionOptions) {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const prevUrl = page.url();
        const result = await page.fill(ref, value);
        const meta = await this.collectActionMeta(session, pageId, page, prevUrl, opts, true);
        return { ...result, ...meta };
    }

    async fillFields(
        browserId: string,
        pageId: string,
        fields: FillFieldInput[],
        opts?: ActionOptions,
    ): Promise<({ results: FillFieldResult[] } & PageActionMeta) | undefined> {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const prevUrl = page.url();

        const completed: FillFieldResult[] = [];

        for (const { ref, value } of fields) {
            try {
                const res = await page.fill(ref, value);
                completed.push(res);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Fill failed';
                throw new FillBatchError(message, ref, completed);
            }
        }

        const meta = await this.collectActionMeta(session, pageId, page, prevUrl, opts, true);
        return { results: completed, ...meta };
    }
    async availableXYscroll(browserId: string, pageId: string) {
        const page = this.getPageDriver(browserId, pageId);
        if (!page) return undefined;
        return await page.getScroll();
    }

    async scrollPage(browserId: string, pageId: string, left: number, top: number, opts?: ActionOptions) {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const prevUrl = page.url();
        const result = await page.scrollBy(left, top);
        const meta = await this.collectActionMeta(session, pageId, page, prevUrl, opts, true);
        return { ...result, ...meta };
    }

    async reloadPage(
        browserId: string,
        pageId: string,
        opts?: ActionOptions,
    ): Promise<({ reloaded: true } & PageActionMeta) | undefined> {
        const session = this.browsers.get(browserId);
        const page = session?.pages.get(pageId);
        if (!session || !page) return undefined;
        session.lastUsed = Date.now();
        const prevUrl = page.url();
        await page.reload();
        const meta = await this.collectActionMeta(session, pageId, page, prevUrl, opts, false);
        return { reloaded: true, ...meta };
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