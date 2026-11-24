import { describe, expect, it } from '@jest/globals';
import { BrowserManager } from './manager.ts';
import type { BrowserDriver, BrowserEngine, ClickOptions, PageDriver, WaitOptions } from './types.ts';
import { FillBatchError } from './types.ts';
import { WaitTimeoutError } from './wait.ts';

function createMockPage(initial = { url: 'https://example.com', title: 'Home', snapshot: '[ref=e1] button "Go"\n[ref=e2] textbox "Name"\n[ref=e3] link "A"\n[ref=e4] link "B"' }) {
    const state = {
        ...initial,
        fullSnapshot: `- root:\n  ${initial.snapshot}`,
        failTitleOnce: false,
        clickNavigated: false,
        lastClickOpts: undefined as ClickOptions | undefined,
        lastWaitOpts: undefined as WaitOptions | undefined,
        failWaitTimeout: false,
    };

    const page: PageDriver = {
        url: () => state.url,
        title: async () => {
            if (state.failTitleOnce) {
                state.failTitleOnce = false;
                throw new Error('Execution context was destroyed');
            }
            return state.title;
        },
        goto: async (url: string) => {
            state.url = url;
            state.title = `Title for ${url}`;
        },
        reload: async () => {},
        close: async () => {},
        snapshot: async () => state.snapshot,
        fullSnapshot: async () => state.fullSnapshot,
        click: async (ref: string, options?: ClickOptions) => {
            state.lastClickOpts = options;
            return { clicked: true as const, ref, x: 10, y: 20, navigated: state.clickNavigated };
        },
        fill: async (ref: string, value: string) => {
            if (ref === 'missing') {
                throw new Error('Ref [missing] not found');
            }
            return { filled: true, ref, value };
        },
        wait: async (options: WaitOptions) => {
            state.lastWaitOpts = options;
            if (state.failWaitTimeout) {
                throw new WaitTimeoutError('Wait timed out after 1000ms');
            }
            if (options.url) {
                state.url = `https://example.com${options.url.startsWith('/') ? options.url : '/' + options.url}`;
                state.title = 'Dashboard';
            }
            return { waited: true as const, elapsedMs: 42 };
        },
        getScroll: async () => ({ x: 0, y: 0, maxX: 0, maxY: 1000 }),
        scrollBy: async (left: number, top: number) => ({ x: left, y: top }),
        startScreencast: async () => {
            throw new Error('not implemented');
        },
        dispatchInput: async () => {},
        releaseInput: async () => {},
        setViewport: async (width: number, height: number) => ({ width, height }),
        screenshot: async () => '/tmp/s.png',
        onAgentCursor: () => () => {},
        onNavigate: () => {},
        onClose: () => {},
    };

    return { page, state };
}

function createMockManager(page: PageDriver): BrowserManager {
    const driver: BrowserDriver = {
        newPage: async () => page,
        close: async () => {},
        isConnected: () => true,
        onDisconnected: () => {},
    };
    const engine: BrowserEngine = {
        name: 'mock',
        launch: async () => driver,
    };
    return new BrowserManager([engine], 'mock');
}

describe('BrowserManager action metadata and snapshot diff', () => {
    it('returns url, title, navigated on click and retries transient title errors', async () => {
        const { page, state } = createMockPage();
        state.failTitleOnce = true;
        const manager = createMockManager(page);
        const browserId = await manager.createBrowser('u1', {});
        const pageId = await manager.createPage(browserId);

        const res = await manager.clickButton(browserId, pageId, 'e1');
        expect(res).toMatchObject({
            clicked: true,
            ref: 'e1',
            url: 'https://example.com',
            title: 'Home',
            navigated: false,
        });
        expect(res?.snapshot).toBeUndefined();
    });

    it('returns diff after previous snapshot and falls back to compact on navigation', async () => {
        const { page, state } = createMockPage();
        const manager = createMockManager(page);
        const browserId = await manager.createBrowser('u1', {});
        const pageId = await manager.createPage(browserId);

        // Seed cache via normal snapshotPage
        await manager.snapshotPage(browserId, pageId);

        // Small change on same URL -> diff
        state.snapshot = '[ref=e1] button "Go"\n[ref=e2] textbox "Name" value="Alice"\n[ref=e3] link "A"\n[ref=e4] link "B"';
        const fillRes = await manager.fillForm(browserId, pageId, 'e2', 'Alice', { snapshot: 'diff' });
        expect(fillRes?.snapshotMode).toBe('diff');
        expect(fillRes?.snapshot).toContain('+ [ref=e2] textbox "Name" value="Alice"');
        expect(fillRes?.navigated).toBe(false);

        // Navigation -> falls back to compact
        state.snapshot = '[ref=e1] heading "Next Page"';
        const navRes = await manager.updatePageUrl(browserId, pageId, 'https://example.com/next', { snapshot: 'diff' });
        expect(navRes?.navigated).toBe(true);
        expect(navRes?.snapshotMode).toBe('compact');
        expect(navRes?.snapshot).toBe('[ref=e1] heading "Next Page"');
    });

    it('fillFields returns metadata and throws FillBatchError with partial progress on failure', async () => {
        const { page } = createMockPage();
        const manager = createMockManager(page);
        const browserId = await manager.createBrowser('u1', {});
        const pageId = await manager.createPage(browserId);

        const ok = await manager.fillFields(
            browserId,
            pageId,
            [
                { ref: 'e2', value: 'Alice' },
                { ref: 'e3', value: 'Bob' },
            ],
            { snapshot: 'compact' },
        );
        expect(ok?.results).toHaveLength(2);
        expect(ok?.url).toBe('https://example.com');
        expect(ok?.snapshotMode).toBe('compact');

        await expect(
            manager.fillFields(browserId, pageId, [
                { ref: 'e2', value: 'Alice' },
                { ref: 'missing', value: 'x' },
            ]),
        ).rejects.toThrow(FillBatchError);
    });

    it('preserves driver-reported navigation on click even when URL is unchanged', async () => {
        const { page, state } = createMockPage();
        state.clickNavigated = true;
        const manager = createMockManager(page);
        const browserId = await manager.createBrowser('u1', {});
        const pageId = await manager.createPage(browserId);

        const res = await manager.clickButton(browserId, pageId, 'e1');
        expect(res?.navigated).toBe(true);
        expect(res?.url).toBe('https://example.com');
    });

    it('waitPage returns elapsedMs, metadata, optional snapshot, and propagates WaitTimeoutError', async () => {
        const { page, state } = createMockPage();
        const manager = createMockManager(page);
        const browserId = await manager.createBrowser('u1', {});
        const pageId = await manager.createPage(browserId);

        state.snapshot = '[ref=e1] heading "Dashboard"';
        const res = await manager.waitPage(
            browserId,
            pageId,
            { url: '/dashboard', load: 'domcontentloaded', timeout: 5000 },
            { snapshot: 'compact' },
        );
        expect(res).toMatchObject({
            waited: true,
            elapsedMs: 42,
            url: 'https://example.com/dashboard',
            title: 'Dashboard',
            navigated: true,
            snapshotMode: 'compact',
            snapshot: '[ref=e1] heading "Dashboard"',
        });
        expect(state.lastWaitOpts).toEqual({ url: '/dashboard', load: 'domcontentloaded', timeout: 5000 });

        state.failWaitTimeout = true;
        await expect(manager.waitPage(browserId, pageId, { text: 'Never' })).rejects.toThrow(WaitTimeoutError);
    });

    it('applies defaultHumanize when omitted and allows per-browser overrides', async () => {
        const { page } = createMockPage();
        const launchedConfigs: Array<{ humanize?: boolean }> = [];
        const driver: BrowserDriver = {
            newPage: async () => page,
            close: async () => {},
            isConnected: () => true,
            onDisconnected: () => {},
        };
        const engine: BrowserEngine = {
            name: 'mock',
            launch: async (config) => {
                launchedConfigs.push({ humanize: config.humanize });
                return driver;
            },
        };

        const manager = new BrowserManager([engine], 'mock', true);
        const bDefault = await manager.createBrowser('u1', {});
        const bFalse = await manager.createBrowser('u2', { humanize: false });
        const bTrue = await manager.createBrowser('u3', { humanize: true });

        expect(launchedConfigs).toEqual([
            { humanize: true },
            { humanize: false },
            { humanize: true },
        ]);

        const summaries = manager.listBrowsers();
        expect(summaries.find((b) => b.id === bDefault)?.humanize).toBe(true);
        expect(summaries.find((b) => b.id === bFalse)?.humanize).toBe(false);
        expect(summaries.find((b) => b.id === bTrue)?.humanize).toBe(true);
    });
});
