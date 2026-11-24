import { describe, expect, it } from '@jest/globals';
import { BrowserManager } from './manager.ts';
import type { BrowserDriver, BrowserEngine, PageDriver } from './types.ts';
import { FillBatchError } from './types.ts';

function createMockPage(initial = { url: 'https://example.com', title: 'Home', snapshot: '[ref=e1] button "Go"\n[ref=e2] textbox "Name"\n[ref=e3] link "A"\n[ref=e4] link "B"' }) {
    const state = { ...initial, fullSnapshot: `- root:\n  ${initial.snapshot}`, failTitleOnce: false };

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
        click: async (ref: string) => ({ clicked: true as const, ref, x: 10, y: 20 }),
        fill: async (ref: string, value: string) => {
            if (ref === 'missing') {
                throw new Error('Ref [missing] not found');
            }
            return { filled: true, ref, value };
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
});
